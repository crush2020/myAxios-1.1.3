'use strict';

// 引入 utils 对象，有很多工具方法。
import utils from './utils.js';
// 引入 bind 方法
import bind from './helpers/bind.js';
// 核心构造函数 Axios
import Axios from './core/Axios.js';
// 合并配置方法
import mergeConfig from './core/mergeConfig.js';
// 引入默认配置
import defaults from './defaults/index.js';
import formDataToJSON from './helpers/formDataToJSON.js';
import CanceledError from './cancel/CanceledError.js';
import CancelToken from './cancel/CancelToken.js';
import isCancel from './cancel/isCancel.js';
import {VERSION} from './env/data.js';
import toFormData from './helpers/toFormData.js';
import AxiosError from './core/AxiosError.js';
import spread from './helpers/spread.js';
import isAxiosError from './helpers/isAxiosError.js';

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 *
 * @returns {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  const context = new Axios(defaultConfig);
  const instance = bind(Axios.prototype.request, context);

  // Copy axios.prototype to instance
  utils.extend(instance, Axios.prototype, context, {allOwnKeys: true});

  // Copy context to instance
  utils.extend(instance, context, null, {allOwnKeys: true});

  // Factory for creating new instances
  // 工厂模式 创建新的实例 用户可以自定义一些参数
  instance.create = function create(instanceConfig) {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

// Create the default instance to be exported
// 创建默认实例
const axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
// 暴露 Axios calss 允许 class 继承
axios.Axios = Axios;

// Expose Cancel & CancelToken
// 取消相关API实现
axios.CanceledError = CanceledError;
axios.CancelToken = CancelToken;
axios.isCancel = isCancel;
axios.VERSION = VERSION;
axios.toFormData = toFormData;

// Expose AxiosError class
// 公开Axios错误信息类
axios.AxiosError = AxiosError;

// alias for CanceledError for backward compatibility
// 用于向后兼容的CanceledError的别名
axios.Cancel = axios.CanceledError;

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};

// 就是利用apply把数组形式的参数转为一个个参数传入
axios.spread = spread;

// Expose isAxiosError
// 公开isAxiosError类
axios.isAxiosError = isAxiosError;

// 数据转换
axios.formToJSON = thing => {
  return formDataToJSON(utils.isHTMLForm(thing) ? new FormData(thing) : thing);
};

export default axios
