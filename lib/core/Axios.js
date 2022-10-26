'use strict';

import utils from './../utils.js';
import buildURL from '../helpers/buildURL.js';
import InterceptorManager from './InterceptorManager.js';
import dispatchRequest from './dispatchRequest.js';
import mergeConfig from './mergeConfig.js';
import buildFullPath from './buildFullPath.js';
import validator from '../helpers/validator.js';
import AxiosHeaders from './AxiosHeaders.js';

const validators = validator.validators;

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 *
 * @return {Axios} A new instance of Axios
 */
class Axios {
  constructor(instanceConfig) {
    this.defaults = instanceConfig;
    this.interceptors = {
      request: new InterceptorManager(),
      response: new InterceptorManager()
    };
  }

  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  request(configOrUrl, config) {
    /*eslint no-param-reassign:0*/
    // Allow for axios('example/url'[, config]) a la fetch API
    //判断第一个参数是字符串，则设置 url,也就是支持axios('example/url', [, config])，也支持axios({})。
    if (typeof configOrUrl === 'string') {
      config = config || {};
      config.url = configOrUrl;
    } else {
      config = configOrUrl || {};
    }
    // .合并默认参数和用户传递的参数
    config = mergeConfig(this.defaults, config);

    const {transitional, paramsSerializer} = config;

    if (transitional !== undefined) {
      validator.assertOptions(transitional, {
        silentJSONParsing: validators.transitional(validators.boolean),
        forcedJSONParsing: validators.transitional(validators.boolean),
        clarifyTimeoutError: validators.transitional(validators.boolean)
      }, false);
    }

    if (paramsSerializer !== undefined) {
      validator.assertOptions(paramsSerializer, {
        encode: validators.function,
        serialize: validators.function
      }, true);
    }

    // Set config.method
    //设置请求的方法，默认是是get方法
    config.method = (config.method || this.defaults.method || 'get').toLowerCase();

    // Flatten headers
    //拍平 headers
    const defaultHeaders = config.headers && utils.merge(
      config.headers.common,
      config.headers[config.method]
    );

    defaultHeaders && utils.forEach(
      ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
      function cleanHeaderConfig(method) {
        delete config.headers[method];
      }
    );

    config.headers = new AxiosHeaders(config.headers, defaultHeaders);

    // filter out skipped interceptors
    // 过滤掉跳过的其拦截器

    // 存储过滤后的请求拦截器
    const requestInterceptorChain = [];
    // 是否异步执行构造器，初始值为true
    let synchronousRequestInterceptors = true;
    this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
      // 当拦截器的options的runWhen为函数且返回的结果为falses时跳出循环
      if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
        return;
      }
      // 当拦截器的options的synchronous === true 时，才为同步执行，否则为异步
      synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
      // 把请求拦截器器插入到数组开头，这就是为什么后写的请求拦截器先执行的原因
      requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
    });

    // 存储响应拦截器，
    const responseInterceptorChain = [];
    this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
      responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
    });

    let promise;
    let i = 0;
    let len;

    // 默认时或者synchronous === false时异步执行请求
    if (!synchronousRequestInterceptors) {
      // 创建队列
      const chain = [dispatchRequest.bind(this), undefined];
      // 把处理后的拦截器插入任务队列的对应位置
      chain.unshift.apply(chain, requestInterceptorChain);
      chain.push.apply(chain, responseInterceptorChain);
      len = chain.length;

      // 给下一个promise传递一个参数config
      promise = Promise.resolve(config);

      // 按顺序一次执行队列里的任务
      while (i < len) {
        promise = promise.then(chain[i++], chain[i++]);
      }

      return promise;
    }

    
    // 处理同步时的任务队列
    len = requestInterceptorChain.length;

    let newConfig = config;

    i = 0;
    // 没有使用promise封装，保证了任务队列依次执行
    while (i < len) {
      const onFulfilled = requestInterceptorChain[i++];
      const onRejected = requestInterceptorChain[i++];
      try {
        newConfig = onFulfilled(newConfig);
      } catch (error) {
        onRejected.call(this, error);
        break;
      }
    }

    // 请求拦截同步时，执行的请求，出错抛出异常
    try {
      promise = dispatchRequest.call(this, newConfig);
    } catch (error) {
      return Promise.reject(error);
    }

    // 处理响应时拦截
    i = 0;
    len = responseInterceptorChain.length;

    while (i < len) {
      promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
    }

    return promise;
  }

  getUri(config) {
    config = mergeConfig(this.defaults, config);
    const fullPath = buildFullPath(config.baseURL, config.url);
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
}

// Provide aliases for supported request methods
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, config) {
    return this.request(mergeConfig(config || {}, {
      method,
      url,
      data: (config || {}).data
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/

  function generateHTTPMethod(isForm) {
    return function httpMethod(url, data, config) {
      return this.request(mergeConfig(config || {}, {
        method,
        headers: isForm ? {
          'Content-Type': 'multipart/form-data'
        } : {},
        url,
        data
      }));
    };
  }

  Axios.prototype[method] = generateHTTPMethod();

  Axios.prototype[method + 'Form'] = generateHTTPMethod(true);
});

export default Axios;
