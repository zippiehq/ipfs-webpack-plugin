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
                          element.removeAttribute('src')
                          
                          window.ipfs.ready.then(() => {
                            window.ipfs_fetch(hash.brotli).then(function(result) {
                              console.log('[chunk[ ipfs loaded ' +  src + ' from ' +  hash + ' brotli: ' + brotli)

                              newscript.removeAttribute('src')
                              newscript.text = result.toString('utf8')
                              newscript.onerror = newscript.onload = onScriptComplete
                              console.log('[chunk[ loading ' + src + ' as text')
                              document.head.appendChild(newscript);
                          })
                        } else {
                          console.log('not using the usual path.. ')
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

            const wrap2 = hook => {
               hook.tap('PolyfillIPFSScriptSrc', (source, chunk, hash, moduleTemplate, dependencyTemplates) => {
                  console.log('got into requireEnsure, before source:' + source)
                  source = source.replace(
                    /head.appendChild\(linkTag\)/g,
                    `(function(head, linkTag, src) {
                        if (window.ipfsWebpackFiles['build' + src]) {
                          var hash = window.ipfsWebpackFiles['build' + src].hash
                          var brotli = false
                          if (window.brotli_decompress && window.ipfsWebpackFiles['build' + src + '.br']) {
                            brotli = true
                            hash = window.ipfsWebpackFiles['build' + src + '.br'].hash
                          }
                          console.log('[css-chunk] ipfs loading ' + src + ' as hash ' + hash + ' brotli: ' + brotli)
                          
                          window.ipfs.ready.then(() => {
                            window.ipfs_fetch(hash, brotli).then(function(result) {
                              console.log('[css-chunk[ ipfs loaded ' +  src + ' from ' +  hash + ' brotli: ' + brotli)

                              linkTag.href = 'data:text/css;base64,' + result.toString('base64')
                              console.log('[css-chunk[ loading ' + src + ' as data uri')
                              head.appendChild(linkTag)
                            })
                          })  
                        } else {
                          head.appendChild(linkTag);
                        }
                    })(head, linkTag, fullhref)`)
                    
                  console.log('after ' + source)
                                      
                  return source
               })
            }
            wrap2(compilation.mainTemplate.hooks.requireEnsure)
          }
          
          
        )
      }
    )
  }
}
