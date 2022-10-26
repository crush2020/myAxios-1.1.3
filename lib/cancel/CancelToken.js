'use strict';

import CanceledError from './CanceledError.js';

/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @param {Function} executor The executor function.
 *
 * @returns {CancelToken}
 */
class CancelToken {
  constructor(executor) {
    if (typeof executor !== 'function') {
      throw new TypeError('executor must be a function.');
    }

    // 存储promise的成功的resolve回调函数，方便调用，取消时调用
    let resolvePromise;

    this.promise = new Promise(function promiseExecutor(resolve) {
      resolvePromise = resolve;
    });

    const token = this;

    // eslint-disable-next-line func-names
    // 这里的cancel就是resolvePromise(token.reason)中的token.reason
    this.promise.then(cancel => {
      // 这里的取消任务队列_listeners就是subscribe()被执行的时候赋值的onCanceled函数
      // 判断有取消任务
      if (!token._listeners) return;

      let i = token._listeners.length;
      // 有就把任务拿出来依次执行，并传入错误信息对象token.reason
      while (i-- > 0) {
        token._listeners[i](cancel);
      }
      // 执行完后，取消任务队列赋值为空
      token._listeners = null;
    });

    // eslint-disable-next-line func-names
     // 这里的cancel也是token.reason
    this.promise.then = onfulfilled => {
      let _resolve;
      // eslint-disable-next-line func-names
      // 相当于把new Promise里的函数传入promiseExecutor当参数
      const promise = new Promise(resolve => {
        token.subscribe(resolve);
        _resolve = resolve;
      }).then(onfulfilled);

      // 
      promise.cancel = function reject() {
        token.unsubscribe(_resolve);
      };

      return promise;
    };

    // 真正取消source.cancel()所调用的函数
    executor(function cancel(message, config, request) {
      // 是否已经取消
      if (token.reason) {
        // Cancellation has already been requested
        return;
      }

      // 设置取消信息
      token.reason = new CanceledError(message, config, request);
      // resolvePromise为this.promise成功的回调函数reslove
      //resolvePromise被调用，这个时候 this.promise.then()的reslove就可以被调用了
      resolvePromise(token.reason);
    });
  }

  /**
   * Throws a `CanceledError` if cancellation has been requested.
   */
  throwIfRequested() {
    if (this.reason) {
      throw this.reason;
    }
  }

  /**
   * Subscribe to the cancel signal
   */

  // cancelToken取消时被调用，传入的是在xhr文件声明的函数onCanceled，即[onCanceled]
  subscribe(listener) {
    // 判断是否已经取消过了
    if (this.reason) {
      listener(this.reason);
      return;
    }

    // 判断有无其他的取消任务
    if (this._listeners) {
      this._listeners.push(listener);
    } else {
      this._listeners = [listener];
    }
  }

  /**
   * Unsubscribe from the cancel signal
   */
// 删除指定的取消任务
  unsubscribe(listener) {
    if (!this._listeners) {
      return;
    }
    const index = this._listeners.indexOf(listener);
    if (index !== -1) {
      this._listeners.splice(index, 1);
    }
  }

  /**
   * Returns an object that contains a new `CancelToken` and a function that, when called,
   * cancels the `CancelToken`.
   */
  // 创建一个source时，被调用
  static source() {
    let cancel;
    const token = new CancelToken(function executor(c) {
      // 这里的c就是executor函数的参数，cancel函数
      cancel = c;
    });
    return {
      token,
      cancel
    };
  }
}

export default CancelToken;
