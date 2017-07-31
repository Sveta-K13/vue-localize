import { kebabCase, each, set, get, unset, clone, cloneDeep } from 'lodash'
import { currentLanguage } from './vuex-getters'
// import { localizeVueDirective } from './vue-localize-directive'
import { Translator } from './libs/translate.js'
import { has } from './libs/utils'

// @todo by Saymon: pick out into config
var localStorageKey = 'currentLanguage'

function saveLanguageToLocalStorage (lang) {
  window.localStorage.setItem(localStorageKey, lang)
}

function getFromLocalStorage () {
  return window.localStorage.getItem(localStorageKey)
}

//
// ******************************************************************
//                          VUEX STORE MODULE                      //
// ******************************************************************
//

/**
 * Mutation for switching applcation language
 */
const SET_APP_LANGUAGE = 'SET_APP_LANGUAGE'

const state = {
  currentLanguage: null
}

const mutations = {
  /**
   * @state {Object}
   * @lang {String}
   */
  [SET_APP_LANGUAGE] (state, lang, saveToLocalStorage = true) {
    state.currentLanguage = lang
    if (saveToLocalStorage) {
      saveLanguageToLocalStorage(lang)
    }
  }
}

/**
 * Export Vuex store module
 */
export const vueLocalizeVuexStoreModule = {
  state,
  mutations
}

//
// ******************************************************************
//                               PLUGIN                            //
// ******************************************************************
//

/**
 * @Vue     {Object} - Vue
 * @options {Object} - plugin options
 */
export default function install (Vue, options) {
  /**
   * @store           {Object} - an instance of a vuex storage
   * @config          {Object} - config object
   * @routesRegistry  {Object} - registry of a routes (with initial names and localized names)
   */
  const { store, config, router, routes } = options

  store.registerModule('vueLocalize', vueLocalizeVuexStoreModule)

  store.commit('SET_APP_LANGUAGE', config.defaultLanguage, false)

  var idIncrement = 0
  var routesComponents = {}
  var routesRegistry = {initial: {}, localized: {}}

  /**
   * Returns current selected application language
   * @return {String}
   */
  function _currentLanguage () {
    return store.state.vueLocalize.currentLanguage
  }

  /**
   * Recursive renaming subroutes
   */
  function _localizeSubroutes (subroutes, lang, routesRegistry) {
    each(subroutes, function (route, path) {
      if (get(route, 'name', false)) {
        set(routesRegistry.initial, route.name, route.path)
        route.originalName = route.name
        route.name = lang + '_' + route.name
        set(routesRegistry.localized, route.name, lang)
      }

      if (!route.meta) {
        route.meta = {}
      }
      route.meta.localized = true
      route.meta.lang = lang

      if (get(route, 'children', false)) {
        var objSubs = clone(route.children)
        unset(route, 'children')

        var subs = cloneDeep(objSubs)
        var subroutesLocalized = _localizeSubroutes(subs, lang, routesRegistry)
        route.children = subroutesLocalized
      }
    })

    return subroutes
  }

  /**
   * Recursive action call
   */
  function _recursively (object, action, isRoot = true) {
    each(object, function (value, key) {
      if (isRoot === true && !get(value.meta, 'localized', false)) {
        return
      }

      action(key, value)
      if (has(value, 'children')) {
        _recursively(value.children, action, false)
      }
    })
  }

  /**
   * Assign route id
   */
  function _identicateRoutes (path, routeConfig) {
    set(routeConfig, 'vueLocalizeId', idIncrement)
    idIncrement++
  }

  /**
   * Add component into separate object by previously assigned route id
   */
  function _collectComponents (path, routeConfig) {
    set(routesComponents, routeConfig.vueLocalizeId, {})
    set(routesComponents[routeConfig.vueLocalizeId], 'component', routeConfig.component)
  }

  /**
   * Detach component from route
   */
  function _detachComponents (path, routeConfig) {
    unset(routeConfig, 'component')
  }

  function _attachComponents (path, routeConfig) {
    set(routeConfig, 'component', routesComponents[routeConfig.vueLocalizeId].component)
  }

  /**
   * Localization of routes
   */
  function localizeRoutes (routes, config) {
    _recursively(routes, _identicateRoutes)
    _recursively(routes, _collectComponents)
    _recursively(routes, _detachComponents)

    let result = cloneDeep(routes)
    each(routes, function (routeConfig, index) {
      let path = routeConfig.path
      if (!get(routeConfig.meta, 'localized', false)) {
        return
      }

      if (get(routeConfig, 'name', false)) {
        set(routesRegistry.initial, routeConfig.name, routeConfig.path)
      }

      var objRoute = clone(routeConfig)
      result.splice(index, 1)

      if (get(objRoute, 'children', false)) {
        var objSubs = clone(objRoute.children)
        unset(objRoute, 'children')
      }

      each(config.languages, function (langConfig, lang) {
        if (!langConfig.enabled) {
          return
        }

        var newNode = cloneDeep(objRoute)
        if (!newNode.meta) {
          newNode.meta = {}
        }

        var suffix = ''
        if (routeConfig.path[0] === '/' && routeConfig.path.length === 1) {
          suffix = ''
        } else if (routeConfig.path[0] === '/' && routeConfig.path.length > 1) {
          suffix = routeConfig.path
        } else if (routeConfig.path[0] !== '/') {
          suffix = '/' + path
        }

        var prefix = lang
        if (config.defaultLanguageRoute === false) {
          prefix = config.defaultLanguage !== lang ? lang : ''
        }

        var newPath = '/' + prefix + suffix
        newNode.path = newPath
        newNode.meta.lang = prefix

        var subs = cloneDeep(objSubs)
        var subroutesLocalized = _localizeSubroutes(subs, lang, routesRegistry)
        newNode.children = subroutesLocalized
        result.push(newNode)
      })
    })

    _recursively(result, _attachComponents)

    return result
  }

  var routesMap = localizeRoutes(routes, config)
  router.addRoutes(routesMap)

  router.beforeEach(function (to, from, next) {
    if (get(to.meta, 'localized', false)) {
      /* prevent unnecessary mutation call  */
      if (_currentLanguage() !== to.meta.lang) {
        store.commit('SET_APP_LANGUAGE', to.meta.lang, config.resaveOnLocalizedRoutes)
      }
    } else if (get(from.meta, 'localized', false) && !config.resaveOnLocalizedRoutes) {
      // Restore memorized language from local storage for not localized routes
      var localStoredLanguage = getFromLocalStorage()
      if (localStoredLanguage && /* prevent unnecessary mutation call  */ from.meta.lang !== localStoredLanguage) {
        store.commit('SET_APP_LANGUAGE', localStoredLanguage, false)
      }
    }

    next()
  })

  /**
   * Object with VueLocalize config
   */
  Vue.prototype['$localizeConf'] = config

  Vue.prototype['$vueLocalizeInit'] = (route) => {
    var initialLanguage = has(route, 'localized') ? route.lang : getFromLocalStorage()
    if (initialLanguage) {
      store.commit('SET_APP_LANGUAGE', initialLanguage, config.resaveOnLocalizedRoutes)
    }
  }

  /**
   * Localize route name by adding prefix (e.g. 'en_') with language code.
   */
  Vue.prototype['$localizeRoute'] = (name, lang = null) => {
    if (!has(routesRegistry.initial, name)) {
      return name
    }

    var prefix = (lang || _currentLanguage()) + '_'
    return prefix + name
  }

  Vue.prototype['$localizeRoutePath'] = (route, newLang) => {
    var path = route.path
    var name = route.name

    if (!has(routesRegistry.initial, name) && !has(routesRegistry.localized, name)) {
      return path
    }

    if (config.defaultLanguageRoute === true) {
      return path.replace(/^.{3}/g, '/' + newLang)
    }

    if (config.defaultLanguage === _currentLanguage()) {
      return '/' + newLang + path
    }

    if (newLang === config.defaultLanguage) {
      var newPath = path.replace(/^.{3}/g, '')
      if (!newPath.length) {
        newPath = '/'
      }

      return newPath
    }
  }

  Vue.prototype['$isJustLanguageSwitching'] = (transition) => {
    return transition.from.originalName === transition.to.originalName
  }

  const translator = new Translator(config, _currentLanguage)

  // Adding global filter and global method $translate
  // each({ translate }, function (helper, name) {
  Vue.filter('translate', (message, params, lang) => translator.translate(message, params, lang))
  Vue.prototype['$translate'] = (message, params, lang) => translator.translate(message, params, lang)
  // })
}
