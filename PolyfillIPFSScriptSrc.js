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
                          
                          window.ipfs_fetch(hash, brotli).then(function(result) {
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
                          
                          window.ipfs_fetch(hash, brotli).then(async (result) => {
                            console.log('[css-chunk[ ipfs loaded ' +  src + ' from ' +  hash + ' brotli: ' + brotli)
                            // only if the css have fonts
                            let contentString = result.toString();
                            if (
                              contentString.includes(".woff2") ||
                              contentString.includes(".woff") ||
                              contentString.includes(".eot") ||
                              contentString.includes(".ttf") ||
                              contentString.includes(".otf")
                            ) {
                              // get all fonts paths
                              const fonts = await Object.keys(window.ipfsWebpackFiles)
                                .filter(
                                  path =>
                                    path.includes(".woff2") ||
                                    path.includes(".woff") ||
                                    path.includes(".eot") ||
                                    path.includes(".ttf") ||
                                    path.includes(".otf")
                                )
                                .filter(path => {
                                  const assetPath = path.replace(window.ipfsWebpackSourceDir + '/', "/");
                                  const p = "url(" + assetPath + ")";
                                  return contentString.includes(p);
                                })
                                .reduce(async (acc, path) => {
                                  const asset = window.ipfsWebpackFiles[path];
                                  console.log('[css-chunk] grabbing ' + path + ' from ' + asset.hash)
                                  const assetContent = await window.ipfs_fetch(asset.hash, false);
                                  console.log('[css-chunk] grabbed ' + path + ' from ' + asset.hash)
                                  const assetPath = asset.path.replace(window.ipfsWebpackSourceDir + '/', "/");
                                  const trueType = assetPath.split(".").pop();
                                  return { ...(await acc), [assetPath]: { assetContent, trueType } };
                                }, {});
                              if (Object.entries(fonts).length !== 0 && fonts.constructor === Object) {
                                Object.keys(fonts).forEach(fontPath => {
                                  const trueType = fonts[fontPath].trueType;
                                  const fontContent =
                                    "data:font/" +
                                    trueType +
                                    ";charset=utf-8;base64," +
                                    fonts[fontPath].assetContent.toString("base64");
                                  const reg = new RegExp(fontPath);
                                  contentString = contentString.replace(reg, fontContent);
                                });
                              }
                            }
                            
                            linkTag.href = 'data:text/css;base64,' + btoa(contentString)
                            console.log('[css-chunk[ loading ' + src + ' as data uri')
                            head.appendChild(linkTag)
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
