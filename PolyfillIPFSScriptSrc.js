module.exports = class PolyfillIPFSScriptSrc {
  constructor() {
  }
  apply(compiler) {
    compiler.hooks.afterPlugins.tap(
      'PolyfillIPFSScriptSrc',
      () => {
        compiler.hooks.thisCompilation.tap(
          'PolyfillIPFSScriptSrc',
          compilation => {
            if (!compilation.mainTemplate.hooks.jsonpScript) {
              throw new Error(
                'PolyfillIPFSScriptSrc can only be used when compiling for web (where JsonpMainTemplatePlugin is active)'
              )
            }
            const wrap = hook => {
              hook.tap(
                'PolyfillIPFSScriptSrc',
                (source, chunk, hash, moduleTemplate, dependencyTemplates) => {
                  console.log(source)
                  source = source.replace(
                    /script.onerror = script.onload = onScriptComplete/g,
                    `(function(element, src, onScriptComplete) {
                        if (window.ipfsWebpackFiles['build' + src]) {
                          var hash = window.ipfsWebpackFiles['build' + src].hash
                          var brotli = false
                          if (window.brotli_decompress && window.ipfsWebpackFiles['build' + src + '.br']) {
                            brotli = true
                            hash = window.ipfsWebpackFiles['build' + src + '.br'].hash
                          }
                          console.log('[chunk] ipfs loading ' + src + ' as hash ' + hash + ' brotli: ' + brotli)
                          var newscript = element.cloneNode()
                          element.onerror = element.onload = null;
                          element.src = undefined
                          
                          window.ipfs.cat(hash, {}).then(function(result) {
                             console.log('[chunk[ ipfs loaded ' +  src + ' from ' +  hash + ' brotli: ' + brotli)
                             if (brotli) {
                                result = window.brotli_decompress(result)
                             }
                             var newsrc = URL.createObjectURL(new Blob([result], {type: 'text/javascript'}))
                             newscript.onerror = newscript.onload = onScriptComplete
                             newscript.src = newsrc
                             console.log('[chunk[ loading ' + src + ' as blob ' + newsrc)
                             document.head.appendChild(newscript);
                          })  
                        } else {
                          element.onerror = element.onload = onScriptComplete
                        }

                                  
                    })(script, jsonpScriptSrc(chunkId), onScriptComplete)`
                  )
                  console.log('after: ')
                  console.log(source)
                  return source
                }
              )
            }
            wrap(compilation.mainTemplate.hooks.jsonpScript)
            wrap(compilation.mainTemplate.hooks.linkPreload)
            wrap(compilation.mainTemplate.hooks.linkPrefetch)
          }
        )
      }
    )
  }
}
