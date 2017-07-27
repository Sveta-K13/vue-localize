/**
 * Created by vestnik on 25/03/16.
 */

// import {Translator} from './libs/translate'

export const localizeVueDirective = (translator) => {
  console.log(translator)
  return {
    translator: translator,
    deep: true,

    /**
     * Bind watcher for update translation on language changing
     */
    bind: function () {
      const vm = this.vm
      this.unwatch = vm.$watch('$store.state.vueLocalizeVuexStoreModule.currentLanguage', bind(this.updateContent, this))
    },

    /**
     * Unbind watcher
     */
    unbind: function () {
      this.unwatch && this.unwatch()
    },

    /**
     * Render element with directive
     */
    update: function (target) {
      this.path = target.path
      this.vars = target.vars
      this.lang = target.lang
      // var translateTo = target.lang || this.translator.getCurrentOrDefault()
      var translation = this.translator.translate(target.path, target.vars, translateTo)
      this.el.innerHTML = translation
    },

    /**
     * Update element innerHTML on language changing
     */
    updateContent: function (newLang) {
      var translateTo = this.lang || newLang
      var translation = this.translator.translate(this.path, this.vars, translateTo)
      this.el.innerHTML = translation
    }
  }
}
