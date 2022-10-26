'use strict';

import utils from './../utils.js';
import settle from './../core/settle.js';
import cookies from './../helpers/cookies.js';
import buildURL from './../helpers/buildURL.js';
import buildFullPath from '../core/buildFullPath.js';
import isURLSameOrigin from './../helpers/isURLSameOrigin.js';
import transitionalDefaults from '../defaults/transitional.js';
import AxiosError from '../core/AxiosError.js';
import CanceledError from '../cancel/CanceledError.js';
import parseProtocol from '../helpers/parseProtocol.js';
import platform from '../platform/index.js';
import AxiosHeaders from '../core/AxiosHeaders.js';
import speedometer from '../helpers/speedometer.js';


// 上传下载相关
function progressEventReducer(listener, isDownloadStream) {
  let bytesNotified = 0;
  const _speedometer = speedometer(50, 250);

  return e => {
    const loaded = e.loaded;
    const total = e.lengthComputable ? e.total : undefined;
    const progressBytes = loaded - bytesNotified;
    const rate = _speedometer(progressBytes);
    const inRange = loaded <= total;

    bytesNotified = loaded;

    const data = {
      loaded,
      total,
      progress: total ? (loaded / total) : undefined,
      bytes: progressBytes,
      rate: rate ? rate : undefined,
      estimated: rate && total && inRange ? (total - loaded) / rate : undefined
    };

    data[isDownloadStream ? 'download' : 'upload'] = true;

    listener(data);
  };
}

export default function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    let requestData = config.data;
    const requestHeaders = AxiosHeaders.from(config.headers).normalize();
    const responseType = config.responseType;

    if (utils.isFormData(requestData) && platform.isStandardBrowserEnv) {
      requestHeaders.setContentType(false); // Let the browser set it
    }
    // eslint-disable-next-line no-debugger
    // 创建一个XML
    let request = new XMLHttpRequest();

    // HTTP basic authentication
    // HTTP基本身份验证
    if (config.auth) {
      const username = config.auth.username || '';
      const password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
      requestHeaders.set('Authorization', 'Basic ' + btoa(username + ':' + password));
    }

    const fullPath = buildFullPath(config.baseURL, config.url);

    // 初始化一个请求。
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
    // 设置超时时间
    request.timeout = config.timeout;

    let onCanceled;
    // 清除请求
    function done() {
      if (config.cancelToken) {
        config.cancelToken.unsubscribe(onCanceled);
      }

      if (config.signal) {
        config.signal.removeEventListener('abort', onCanceled);
      }
    }

    function onloadend() {
      if (!request) {
        return;
      }
      // Prepare the response
      const responseHeaders = AxiosHeaders.from(
        'getAllResponseHeaders' in request && request.getAllResponseHeaders()
      );
      const responseData = !responseType || responseType === 'text' ||  responseType === 'json' ?
        request.responseText : request.response;
      const response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config,
        request
      };

      // 返回结果
      settle(function _resolve(value) {
        resolve(value);
        done();
      }, function _reject(err) {
        reject(err);
        done();
      }, response);

      // Clean up request
      request = null;
    }

    if ('onloadend' in request) {
      // Use onloadend if available
      // 使用已配置的onloadend
      request.onloadend = onloadend;
    } else {
      // Listen for ready state to emulate onloadend
      // 监听 readyState  改变
      request.onreadystatechange = function handleLoad() {
        if (!request || request.readyState !== 4) {
          return;
        }

        // The request errored out and we didn't get a response, this will be
        // handled by onerror instead
        // With one exception: request that using file: protocol, most browsers
        // will return status as 0 even though it's a successful request
        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
          return;
        }
        // readystate handler is calling before onerror or ontimeout handlers,
        // so we should call onloadend on the next 'tick'
        //成功时调用onloadend()
        setTimeout(onloadend);
      };
    }

    // Handle browser request cancellation (as opposed to a manual cancellation)
    // 取消
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }

      reject(new AxiosError('Request aborted', AxiosError.ECONNABORTED, config, request));

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    // 错误
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
     // 超时
    request.ontimeout = function handleTimeout() {
      let timeoutErrorMessage = config.timeout ? 'timeout of ' + config.timeout + 'ms exceeded' : 'timeout exceeded';
      const transitional = config.transitional || transitionalDefaults;
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      reject(new AxiosError(
        timeoutErrorMessage,
        transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED,
        config,
        request));

      // Clean up request
      request = null;
    };

    // Add xsrf header 添加xsrf头
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (platform.isStandardBrowserEnv) {
      // Add xsrf header
      const xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath))
        && config.xsrfCookieName && cookies.read(config.xsrfCookieName);

      if (xsrfValue) {
        requestHeaders.set(config.xsrfHeaderName, xsrfValue);
      }
    }

    // Remove Content-Type if data is undefined
    requestData === undefined && requestHeaders.setContentType(null);

    // Add headers to the request
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
        request.setRequestHeader(key, val);
      });
    }

    // Add withCredentials to request if needed
    if (!utils.isUndefined(config.withCredentials)) {
      request.withCredentials = !!config.withCredentials;
    }

    // Add responseType to request if needed
    // 修改响应类型
    if (responseType && responseType !== 'json') {
      request.responseType = config.responseType;
    }

    // Handle progress if needed
    // 上传下载进度相关
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', progressEventReducer(config.onDownloadProgress, true));
    }

    // Not all browsers support upload events
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', progressEventReducer(config.onUploadProgress));
    }
     // 取消请求相关
     if (config.cancelToken || config.signal) {
      // Handle cancellation
      // eslint-disable-next-line func-names
      //当为cancelToken取消时
      // cancel = function promiseExecutor(resolve) {resolvePromise = resolve;}
      onCanceled = cancel => {
        // 请求就结束时，取消无效
        if (!request) {
          return;
        }
        // 否则就reject出去
        reject(!cancel || cancel.type ? new CanceledError(null, config, request) : cancel);
        // 调用xml的abort（）取消方法
        request.abort();
        //把这次请求的xml置为空
        request = null;
      };
      // 如果config.cancelToken === true,执行后边的并返回结果
      // // cancelToken来自axios.CancelToken
      config.cancelToken && config.cancelToken.subscribe(onCanceled);
      // 另一种方法的实现
      if (config.signal) {
        config.signal.aborted ? onCanceled() : config.signal.addEventListener('abort', onCanceled);
      }
    }

    const protocol = parseProtocol(fullPath);

    if (protocol && platform.protocols.indexOf(protocol) === -1) {
      reject(new AxiosError('Unsupported protocol ' + protocol + ':', AxiosError.ERR_BAD_REQUEST, config));
      return;
    }


    // Send the request
    // 发送请求。如果请求是异步的（默认），那么该方法将在请求发送后立即返回。
    request.send(requestData || null);
  });
}
