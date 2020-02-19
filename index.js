/* 

BSD 3-Clause License

Copyright (c) Zippie Ltd. 2019, 
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/

const IPFS = require('ipfs')
const IpfsHttpClient = require('ipfs-http-client')
const { globSource } = IpfsHttpClient
const fs = require("fs");
const cheerio = require("cheerio");
const webpack = require("webpack");
const dotenv = require('dotenv')
const fetch = require('node-fetch');
const zlib = require('zlib');
const appDirectory = fs.realpathSync(process.cwd());

dotenv.config()

const _source_dir = process.env.IPFS_WEBPACK_SOURCE_DIR ? process.env.IPFS_WEBPACK_SOURCE_DIR : 'build'
const _ipfs_repo = process.env.IPFS_WEBPACK_REPO ? process.env.IPFS_WEBPACK_SOURCE_DIR : '.ipfs-webpack-plugin'
const _ipfs_filelist = process.env.IPFS_WEBPACK_FILELIST ? process.env.IPFS_WEBPACK_FILELIST : 'build-ipfs-filelist.json'

class IpfsPlugin {
  constructor(wrapper_list = ['index.html', 'manifest.json'], source_dir = _source_dir) {

    this.wrapper_list = wrapper_list
    this.source_dir = source_dir
    this.ipfs_repo = _ipfs_repo
    this.ipfs_filelist = _ipfs_filelist
  }

  getGetter($) {
    let code
    let fastpeer = process.env.IPFS_WEBPACK_JSIPFS_FASTPEER ? process.env.IPFS_WEBPACK_JSIPFS_FASTPEER : 'https://global-ipfs-fp.dev.zippie.org'
    if (process.env.IPFS_WEBPACK_JSIPFS_GETTER) {
      code = `
      import * as IPFS from 'ipfs';
      import * as multihash from 'multihashes'
      import * as multihashing from 'multihashing-async'
      import * as Block from 'ipfs-block'
      import { BrotliDecompressBuffer as decompress } from "@zippie/brotli/dec/decode";
      
      window.ipfs_ready_state = 0
      window.ipfs_ready_waiting = []
      window.ipfs_ready = function () { 
         return new Promise((resolve, reject) => {
           if (this.ipfs_ready_state == 2) return resolve()
           if (this.ipfs_ready_state == 0) {
              this.ipfs_ready_state = 1
              var bootstrap = ["/dns4/ipfstest.zippie.org/tcp/443/wss/ipfs/QmSjrxBW9vwj4Cm1LyodeqzUGkCvZXQjREY7zogWXxE6ne"]
              IPFS.create({config: {Bootstrap: bootstrap}, preload: {enabled: false } }).then((ipfs) => {
                 window.ipfs = ipfs
                 resolve()
                 for (var i = 0; i < window.ipfs_ready_waiting.length; i++) {
                   window.ipfs_ready_waiting[i]()
                 }
                 this.ipfs_ready_state = 2
              })
           } else {
              window.ipfs_ready_waiting.push(resolve)
           }
         })
      }
      
      window.brotli_decompress = function (content) {
        return Buffer.from(decompress(content))
      }
    
    window.ipfs_fetch = async function(cid, brotli = false) {
      await window.ipfs_ready()
      const chunks = []
      for await (const chunk of window.ipfs.cat(cid)) {
        chunks.push(chunk)
      }
      const contents = Buffer.concat(chunks)
 
      let decompressed = contents
      if (brotli) {
        try {
          decompressed = Buffer.from(window.brotli_decompress(decompressed))
          console.log('decompress ok')
        } catch (err) {
          console.log(err)
        }
      }
      return decompressed
    }`

    } else {
      code = `
    import { createProxyClient } from "@zippie/ipfs-postmsg-proxy";
    import { BrotliDecompressBuffer as decompress } from "@zippie/brotli/dec/decode";
    
    if (!window.ipfs) {
      window.ipfs = createProxyClient({
         postMessage: function(message, origin) {
            return window.parent.postMessage(message, origin)
         }
      })
    }
    
    window.brotli_decompress = function (content) {
      return Buffer.from(decompress(content))
    }
    
    window.ipfs_fetch = async function(cid, brotli = false) {
      if (false) {
      const chunks = []
      for await (const chunk of window.ipfs.cat(cid)) {
        chunks.push(chunk)
      }
      const contents = Buffer.concat(chunks)
      }
      
      let contents = await window.ipfs.cat(cid)
 
      let decompressed = contents
      if (brotli) {
        try {
          decompressed = Buffer.from(window.brotli_decompress(decompressed))
          console.log('decompress ok')
        } catch (err) {
          console.log(err)
        }
      }
      return decompressed
    }
    `    
    }
    fs.writeFileSync(`${appDirectory}/ipfsGetter.js`, code);
    const jsTempPath = `${appDirectory}/ipfsGetter.js`;
    const options = {
      mode: "production",
      watch: false,
      entry: jsTempPath,
      output: {
        path: appDirectory,
        filename: "ipfsGetterBundle.js"
      },
      resolve: {
         alias: {
           'ipfs-bitswap': '@zippie/ipfs-bitswap'
         }
      }
    };
    const compiler = webpack(options);
    return new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err || stats.hasErrors()) {
          console.log(stats.toJson("minimal"));
        }
        const bundle = fs.readFileSync(`${appDirectory}/ipfsGetterBundle.js`);
        $("body").prepend(`<script>${bundle}</script>`);
        fs.unlinkSync(`${appDirectory}/ipfsGetterBundle.js`);
        fs.unlinkSync(`${appDirectory}/ipfsGetter.js`);
        resolve();
      });
    });
  }
  apply(compiler) {

    let publicPath = compiler.options.output.publicPath || "";
    if (publicPath && !publicPath.endsWith("/")) {
      publicPath += "/";
    }
    compiler.hooks.afterEmit.tapAsync("IpfsPlugin", (compilation, callback) => {
      var filelist;
     
      IPFS.create({repo: this.ipfs_repo, start: false, offline: true}).then(async (ipfs) => {
        this.ipfs = ipfs
        var result = await this.ipfs.add(
          globSource(this.source_dir,
          {
            recursive: true,
            ignore: this.wrapper_list,
            wrapWithDirectory: false
          }))

          for await (const file of result) {
            filelist = {
              ...filelist,
              [file.path]: {
                path: file.path,
                hash: file.cid.toString(),
                size: file.size
              }
            };
          }
          for (const file in filelist) {
            if (file.endsWith('.js')) {
               let contents = fs.readFileSync(file).toString('utf8')
               if (filelist[file + '.map']) {
                  console.log('rewriting source map url in ' + file + ' to be IPFS ' + filelist[file + '.map'].hash)
                  
                  contents = contents.replace(/\/\/# sourceMappingURL=.*/, '//# sourceMappingURL=https://gateway.ipfs.io/ipfs/' + filelist[file + '.map'].hash)
                  fs.writeFileSync(file, contents)
                  let result = await this.ipfs.add(contents)
                  for await (const f of result) {
                     filelist[file].hash = f.cid.toString()
                     filelist[file].size = f.size
                  }
               }
            }
          }
          
          if (!process.env.IPFS_WEBPACK_NO_BROTLI) {
            for (const file in filelist) {
              if (file.endsWith('.js') || file.endsWith('.svg') || file.endsWith('.css')) {
                 try { 
                   let contents = fs.readFileSync(file)
                   if (filelist[file].size > 4000) {
                      contents = zlib.brotliCompressSync(contents)
                      let result = await this.ipfs.add(contents)
                      fs.writeFileSync(file + '.br', contents)
                      for await (const f of result) {
                        filelist[file + '.br'] = {path: file + '.br', hash: f.cid.toString(), size: f.size}
                        console.log('brotli compressed ' + file + ' before ' + filelist[file].size + ' after ' + contents.length)
                      }
                   }
                  } catch (err) {
                    // probably a directory
                 }
              }          
            }
          }
          var html = fs.readFileSync(`${appDirectory}/` + this.source_dir + `/index.html`);
          const $ = cheerio.load(html, {xmlMode: false});
          const jsRootHash = filelist[this.source_dir].hash;
          var scriptsEle = $("script[src^='/']")
          var scripts = []
          
          for (var i = 0; i < scriptsEle.length; i++) {
            scripts.push(scriptsEle[i].attribs['src'])
          }
          scriptsEle.remove()
            $("body").prepend(`<script>
            window.ipfsWebpackFiles = ` + JSON.stringify(filelist) + `;
            window.ipfsWebpackSourceDir = ` + JSON.stringify(this.source_dir) + `;
            </script>`)
            var cssEle = $("link[rel=stylesheet]");
            var css = []
            for (var i = 0; i < cssEle.length; i++) {
              css.push(cssEle[i].attribs['href'])
            } 
            $("body").append(`<script>
            var css = ` + JSON.stringify(css) + `;
            
            (async (css) => {
              for (var i = 0; i < css.length; i++) {
                 var hash = window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + css[i]].hash
                 var brotli = false
                 if (window.brotli_decompress && window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + css[i] + '.br']) {
                    brotli = true
                    hash = window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + css[i] + '.br'].hash
                 }

                 console.log('[ipfs-webpack-plugin] grabbing ' + css[i] + ' from ' + hash + ' brotli: ' + brotli)
                 
                 let content = await window.ipfs_fetch(hash, brotli)
                 let contentString = content.toString();
                 // get all fonts paths that are present inside the css file
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
                     console.log('[ipfs-webpack-plugin] grabbing ' + path + ' from ' + asset.hash)
                     const assetContent = await window.ipfs_fetch(asset.hash, false);
                     console.log('[ipfs-webpack-plugin] grabbed ' + path + ' from ' + asset.hash)
                 
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
                     const reg = new RegExp(fontPath, 'g');
                     contentString = contentString.replace(reg, fontContent);
                   });
                 }
                 console.log('[ipfs-webpack-plugin] downloaded ' + css[i] + ' brotli: ' + brotli)
                 var linkTag = document.createElement('link');
                 linkTag.type = 'text/css';
                 linkTag.rel = 'stylesheet';
                 linkTag.href = 'data:text/css;base64,' + btoa(contentString)
                 document.head.appendChild(linkTag);
              }
            })(css).then(() => {
            }).catch((err) => {
               console.log('failed to load css from ipfs: ', err)
            })
            </script>`);
            cssEle.remove()
            
            $("body").append(`<script>
            var scripts = ` + JSON.stringify(scripts) + `;
            
            (async (scripts) => {
              for (var i = 0; i < scripts.length; i++) {
                 var hash = window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + scripts[i]].hash
                 var brotli = false
                 if (window.brotli_decompress && window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + scripts[i] + '.br']) {
                    brotli = true
                    hash = window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + scripts[i] + '.br'].hash
                 }

                 console.log('[ipfs-webpack-plugin] grabbing ' + scripts[i] + ' from ' + hash + ' brotli: ' + brotli)
                 
                 let content = await window.ipfs_fetch(hash, brotli)

                 console.log('[ipfs-webpack-plugin] downloaded ' + scripts[i] + ' brotli: ' + brotli)
                 var newscript = document.createElement('script')
                 newscript.text = content.toString('utf8')
                 document.body.appendChild(newscript)
              }
            })(scripts).then(() => {
            }).catch((err) => {
               console.log('failed to load scripts from ipfs', err)
            })
            </script>`);
            
          if (!process.env.IPFS_WEBPACK_PLUGIN_NO_GETTER) {
            await this.getGetter($)
          }
          html = $.html()
          fs.writeFileSync(`${appDirectory}/` + this.source_dir + `/index.html`, html);
          fs.writeFileSync(`${appDirectory}/` + this.source_dir + `/index.html.br`, zlib.brotliCompressSync(Buffer.from(html, 'utf8')))
          
          result = await this.ipfs.add(
            globSource(this.source_dir,
            {
              recursive: true,
              wrapWithDirectory: false
            }))
            var filelist
            for await (const file of result) {
              filelist = {
                ...filelist,
                [file.path]: {
                  path: file.path,
                  hash: file.cid.toString(),
                  size: file.size
                }
              };
            }
            fs.writeFileSync(
              `${appDirectory}/` + this.ipfs_filelist,
              JSON.stringify(filelist)
            );          
            console.log('IPFS CID: ' + filelist[this.source_dir].hash) 
            await this.ipfs.stop()
            callback();
      }).catch((err) => {
        console.log(err)
      })
    });
  }
}

module.exports = IpfsPlugin;
