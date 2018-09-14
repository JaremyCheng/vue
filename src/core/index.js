import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'

// 增加公共API方法
initGlobalAPI(Vue)

// 设置参数$isServer: 是否服务端渲染
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

// 设置参数$ssrContext: 获取SSR上下文
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// VUE版本号,会由webpack进行替换__VERSION__
Vue.version = '__VERSION__'

export default Vue
