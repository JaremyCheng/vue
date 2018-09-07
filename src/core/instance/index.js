import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// Vue构造函数
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    // 生产环境只能使用new, 否则报错
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}
// 将Vue上的方法切割为多个部分, 再导入到构造函数上
initMixin(Vue)
stateMixin(Vue)
eventsMixin(Vue)
lifecycleMixin(Vue)
renderMixin(Vue)

// 输出Vue
export default Vue
