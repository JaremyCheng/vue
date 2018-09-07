/* @flow */

import config from '../config'
import { warn } from './debug'
import { nativeWatch } from './env'
import { set } from '../observer/index'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
const strats = config.optionMergeStrategies

/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== 'production') {
  // 非生产环境下, el及postsData合并策略函数
  strats.el = strats.propsData = function (parent, child, vm, key) {
    // 该策略只对实例使用
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}

/**
 * Helper that recursively merges two data objects together.
 * 以递归方式来合并两个data对象
 */
function mergeData (to: Object, from: ?Object): Object {
  // 没有from时 返回to
  // 也就是没有parentVal时 直接返回childVal
  if (!from) return to
  let key, toVal, fromVal
  const keys = Object.keys(from)
  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    toVal = to[key]
    fromVal = from[key]
    // 当该属性非自身属性时, 使用set函数来将fromVal合并到to上
    if (!hasOwn(to, key)) {
      set(to, key, fromVal)
      // 如果该属性是自身属性, 并且都为对象时, 进行递归
    } else if (isPlainObject(toVal) && isPlainObject(fromVal)) {
      mergeData(toVal, fromVal)
    }
  }
  // 最后返回to
  return to
}

/**
 * toFix data及provide属性都使用该方法
 * Data 合并数据 
 * data的数据类型可能为:对象 或 返回数据对象的函数
 * @return 返回处理数据的函数
 */
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  // 无vm实例请看下
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    // 在使用Vue.extend来合并的请看下, 父子都应该为函数
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    // 无需检查数据类型, 函数内会将childVal与parentVal数据格式统一为对象格式
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this) : parentVal
      )
    }
  } else if (parentVal || childVal) {
    return function mergedInstanceDataFn () {
      // instance merge
      // 实例合并
      // 兼容函数及对象
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // 子组件data属性必须为function
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    return mergeDataOrFn.call(this, parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * Hooks and props are merged as arrays.
 * 像数组一样合并生命周期钩子函数和props
 * parentVal格式为函数数组
 * childVal为函数货函数数组
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  // 1. 无childVal时, 返回parentVal
  // 2. 有childVal时
  //   1). 有parentVal时, 将childVal与parentVal合并
  //   2). 无parentVal时
  //     i. childVal为数组时, 返回childVal
  //     ii. childVal不是数组时, 转为数组返回
  return childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
}
// 所有生命周期钩子函数的合并策略都使用mergeHook函数
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/**
 * Assets
 * 资源合并策略
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 * 当有vm参数时, 我们需要
 * 对构造函数的options, 实例options 与父级options
 * 这三方进行合并
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  // 基于parentVal为原型创建一个新对象
  const res = Object.create(parentVal || null)
  if (childVal) {
    // assertObjectType 检测childVal是否为纯对象
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    // 将childVal合并到res上并返回
    return extend(res, childVal)
  } else {
    return res
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 * 观察器合并策略
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 * 观察器不该应该是以一个覆盖掉另一个
 * 所以我们以数组格式合并
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  // firefox下自带Object.prototype.watch
  // 以下代码为了避开把这个watch当成vue的watch
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  // 缺少childVal或parentVal时
  if (!childVal) return Object.create(parentVal || null)
  if (process.env.NODE_ENV !== 'production') {
    // 判断childVal是否为对象
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = {}
  // 拷贝parentVal
  extend(ret, parentVal)
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    // parent数据统一为数组
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    // 合并数据
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}

/**
 * Other object hashes.
 * props, methods, inject, computed合并策略
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    // 判断childVal是否为对象
    assertObjectType(key, childVal, vm)
  }
  // 无parentVal时返回childVal
  if (!parentVal) return childVal
  const ret = Object.create(null)
  // 浅拷贝parentVal
  extend(ret, parentVal)
  // 如果有childVal, 浅拷贝childVal, childVal的同名属性覆盖
  if (childVal) extend(ret, childVal)
  return ret
}
// provide合并策略
// 本质与data使用的都是mergeDataOrFn
strats.provide = mergeDataOrFn

/**
 * Default strategy.
 * 默认合并策略
 */
const defaultStrat = function (parentVal: any, childVal: any): any {
  // 没有childVal就返回parentVal
  // 有就返回childVal
  // 完全没有处理任何数据直接返回
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names
 * 检查组件名称
 */
function checkComponents (options: Object) {
  for (const key in options.components) {
    const lower = key.toLowerCase()
    // 检查与Vue默认组件名称是否冲突
    // 检查与浏览器html标签名称是否冲突
    if (isBuiltInTag(lower) || config.isReservedTag(lower)) {
      warn(
        'Do not use built-in or reserved HTML elements as component ' +
        'id: ' + key
      )
    }
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
// 将props规范为对象格式
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return
  const res = {}
  let i, val, name
  // 当props为数组的处理
  if (Array.isArray(props)) {
    i = props.length
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        // 驼峰处理
        name = camelize(val)
        // 代表写法: [key1, key2], 不限定类型和默认值等
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
    // 当props为对象的处理
  } else if (isPlainObject(props)) {
    for (const key in props) {
      val = props[key]
      // 驼峰处理
      name = camelize(key)
      // 代表两种写法: 
      // 1. key: type<String>
      // 2. key: opts<object>
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
    // 到这里, 发现全部都统一为对象写法 props[key] = {type: 'someType'...}
  } else if (process.env.NODE_ENV !== 'production' && props) {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  options.props = res
}

/**
 * Normalize all injections into Object-based format
 */
// 将inject规范为对象格式
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject
  const normalized = options.inject = {}
  // 数组格式下
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      // 格式化为对象: {key: {from: key}}
      // from的用处是指向源字段名 
      // 这样可以在子组件中重新命名来避免冲突, 并将改命名指向回父组件provide的属性
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
    // 最后统一格式为: options.inject = {key: {from: val}}
    // 数组请看下 key和val一致
  } else if (process.env.NODE_ENV !== 'production' && inject) {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 */
// 将directive规范为对象格式 options.directives只能为对象
// 自定义组件了解 #https://cn.vuejs.org/v2/guide/custom-directive.html
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key]
      // 当diretive为函数时, 改为对象
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
    // 规范后格式为: options.directives = {key: {bind: directive, update: diretive}}
    // 当传入内容为字符串时, def = 'string'
    // 使用时不会报错但也没有效果, directive只会触发def[hook]
  }
}
// 判断value是否为对象
function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== 'production') {
    // 检查子组件名称是否与VUE默认标签及HTML标签冲突
    checkComponents(child)
  }

  if (typeof child === 'function') {
    child = child.options
  }
  // 规范化
  normalizeProps(child, vm)
  normalizeInject(child, vm)
  normalizeDirectives(child)
  // TODO extends来源不明
  const extendsFrom = child.extends
  if (extendsFrom) {
    parent = mergeOptions(parent, extendsFrom, vm)
  }
  // 有mixins情况下, 通过递归进行合并mixin参数
  // 这体现了mixin的实现方式,了解下
  if (child.mixins) {
    for (let i = 0, l = child.mixins.length; i < l; i++) {
      parent = mergeOptions(parent, child.mixins[i], vm)
    }
  }
  // 合并参数
  const options = {}
  let key
  for (key in parent) {
    mergeField(key)
  }
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  function mergeField (key) {
    // strat 处理函数, 针对key来进行数据处理
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  const assets = options[type]
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id]
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}
