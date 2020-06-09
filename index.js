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
  constructor(wrapper_list = ['index.html'], source_dir = _source_dir) {

    this.wrapper_list = wrapper_list
    this.source_dir = source_dir
    this.ipfs_repo = _ipfs_repo
    this.ipfs_filelist = _ipfs_filelist
  }

  getGetter() {
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
         /* stub to load stuff */
         window.ipfs_ready_waiting = [] 
         function ipfs_stub_message_callback(event) {
            if (event.data.result && event.data.result.contents) {
               window.removeEventListener('message', ipfs_stub_message_callback)
               window.ipfs_stub_callback = function () {
                  console.log('[ipfs stub loaded]')
                  for (var i = 0; i < window.ipfs_ready_waiting.length; i++) {
                    window.ipfs_ready_waiting[i]()
                  }
               }
               window.eval(event.data.result.contents) // load the stub
             }
             
         }      
         window.ipfs_ready = function() {
            return new Promise((resolve, reject) => {
               if (window.ipfs_stub_loaded) {
                 resolve()
               } else {
                 window.ipfs_ready_waiting.push(resolve)
               }
            })
         }
         
         window.ipfs_fetch = async function (cid, brotli = false) {
            await window.ipfs_ready()
            return await window.ipfs_fetch(cid, brotli)
         }

         window.addEventListener('message', ipfs_stub_message_callback)
         window.parent.postMessage({'wm_ipfs_fetch': { cid: '/ipfs/QmZtSncZ1NzxP5vZUcZJuqMMPUBzd7cnXP4Yr2DtHv9V64/postmsg-proxy-stub.js.br', brotli: true }, callback: 'initial'}, '*')
         
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
        fs.unlinkSync(`${appDirectory}/ipfsGetterBundle.js`);
        fs.unlinkSync(`${appDirectory}/ipfsGetter.js`);
        resolve(bundle)
      });
    });
  }
  apply(compiler) {
    let publicPath = compiler.options.output.publicPath || "";
    if (publicPath && !publicPath.endsWith("/")) {
      publicPath += "/";
    }
    compiler.hooks.afterEmit.tapAsync("IpfsPlugin", (compilation, callback) => {
      if (!fs.existsSync(this.source_dir)) {
        console.log('[ipfs] no source dir exists, skipping')
        return
      }
  
      var filelist;

      IPFS.create({ repo: this.ipfs_repo, start: false, offline: true }).then(async (ipfs) => {
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
            if (process.env.IPFS_WEBPACK_ALWAYS_BROTLI || file.endsWith('.js') || file.endsWith('.svg') || file.endsWith('.css')) {
              try {
                let contents = fs.readFileSync(file)
                if (process.env.IPFS_WEBPACK_ALWAYS_BROTLI || filelist[file].size > 4000) {
                  contents = zlib.brotliCompressSync(contents)
                  let result = await this.ipfs.add(contents)
                  fs.writeFileSync(file + '.br', contents)
                  for await (const f of result) {
                    filelist[file + '.br'] = { path: file + '.br', hash: f.cid.toString(), size: f.size }
                    console.log('brotli compressed ' + file + ' before ' + filelist[file].size + ' after ' + contents.length)
                  }
                }
              } catch (err) {
                // probably a directory
              }
            }
          }
        }

        if (!process.env.IPFS_WEBPACK_NO_INDEX) {
          if (fs.existsSync(`${appDirectory}/` + this.source_dir + `/manifest.json`)) {
            let r = JSON.parse(fs.readFileSync(`${appDirectory}/` + this.source_dir + `/manifest.json`))
            if (r.start_url.startsWith('/index.html') && !r.start_url.endsWith('.br')) {
              r.start_url = r.start_url + '.br'
              let d = Buffer.from(JSON.stringify(r), 'utf8')
              fs.writeFileSync(`${appDirectory}/` + this.source_dir + `/manifest.json`, d)
              let result = this.ipfs.add(d)
              console.log(filelist)
              for await (const f of result) {
                filelist[this.source_dir + '/manifest.json'].hash = f.cid.toString()
                filelist[this.source_dir + '/manifest.json'].size = f.size
              }
              console.log('Rewrote manifest.json')
            }
          }


          var html = fs.readFileSync(`${appDirectory}/` + this.source_dir + `/index.html`);
          const $ = cheerio.load(html, { xmlMode: false });
          const jsRootHash = filelist[this.source_dir].hash;
          $("body").prepend(`<script>
            window.ipfsWebpackFiles = ` + JSON.stringify(filelist) + `;
            window.ipfsWebpackSourceDir = ` + JSON.stringify(this.source_dir) + `;
            </script>`)

          if (!process.env.IPFS_WEBPACK_FIRST_SCRIPTS_HTTP) {
            var scriptsEle = $("script[src^='/']")
            var scripts = []

            for (var i = 0; i < scriptsEle.length; i++) {
              scripts.push(scriptsEle[i].attribs['src'])
            }
            scriptsEle.remove()
            var cssEle = $("link[rel=stylesheet]");
            var css = []
            for (var i = 0; i < cssEle.length; i++) {
              css.push(cssEle[i].attribs['href'])
            }
            
            var download_assets = []

            for (var i = 0; i < css.length; i++) {
                var hash = filelist[this.source_dir + css[i]].hash
                var brotli_hash = undefined

                if (filelist[this.source_dir + css[i] + '.br']) {
                  brotli_hash = filelist[this.source_dir + css[i] + '.br']
                }

                download_assets.push({
                  filename: this.source_dir + css[i],
                  hash: hash,
                  brotli_hash: brotli_hash,
                  type: 'css'
                })

            }
            for (var i = 0; i < scripts.length; i++) {
              var hash = filelist[this.source_dir + scripts[i]].hash
              var brotli_hash = undefined

              if (filelist[this.source_dir + scripts[i] + '.br']) {
                brotli_hash = filelist[this.source_dir + scripts[i] + '.br'].hash
              }

              download_assets.push({
                filename: this.source_dir + scripts[i],
                hash: hash,
                brotli_hash: brotli_hash,
                type: 'script'
              })
            }

            let allFonts = []
            for (var i = 0; i < css.length; i++) {
              const contentString = fs.readFileSync(this.source_dir + css[i]).toString('utf8')

              // get all fonts paths that are present inside the css file
              const fonts = await Object.keys(filelist)
                .filter(
                  path =>
                    path.includes(".woff2") ||
                    path.includes(".woff") ||
                    path.includes(".eot") ||
                    path.includes(".ttf") ||
                    path.includes(".otf")
                )
                .filter(path => {
                  const assetPath = path.replace(this.source_dir + '/', "/");
                  const p = "url(" + assetPath + ")";
                  return contentString.includes(p);
                })
              for (var j = 0; j < fonts.length; j++) {
                if (!allFonts.includes(fonts[j])) {
                  allFonts.push(fonts[j])
                  var hash = filelist[fonts[j]].hash

                  download_assets.push({
                   filename: fonts[j],
                   hash: hash,
                   type: 'font'
                  })  
                }
              }
            }

            $("body").append(`<script>
            (async () => {
              if (window.ipfs_ready) {
                await window.ipfs_ready()
              }
              var download_assets = ` + JSON.stringify(download_assets) + `;
              for (let i = 0; i < download_assets.length; i++) {
                let hash = download_assets[i].hash
                let brotli = false
                if (window.brotli_decompress && download_assets[i].brotli_hash) {
                   brotli = true
                   hash = download_assets[i].brotli_hash
                }
                
                console.log('[ipfs-webpack-plugin] grabbing ' + download_assets[i].filename + ' from ' + hash + ' brotli: ' + brotli)
                let promise = window.ipfs_fetch(hash, brotli)
                download_assets[i].promise = promise
                promise.then(() => {
                  console.log('[ipfs-webpack-plugin] grabbed ' + download_assets[i].filename + ' from ' + hash + ' brotli: ' + brotli)
                })
              }  

              for (var i = 0; i < download_assets.length; i++) {
                if (download_assets[i].type !== 'css')
                  continue

                let content = await download_assets[i].promise
                console.log('[ipfs-webpack-plugin] loading css ' + download_assets[i].filename)
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
                   for (var i = 0; i < download_assets.length; i++) {
                     if (download_assets[i].type !== 'font' || download_assets[i].filename !== path)
                       continue

                     const asset = download_assets[i]
                     console.log('[ipfs-webpack-plugin] font-loading ' + path + ' from ' + asset.hash)
                     const assetContent = await download_assets[i].promise;
                     console.log('[ipfs-webpack-plugin] font-loaded ' + path + ' from ' + asset.hash)
                 
                     const assetPath = asset.filename.replace(window.ipfsWebpackSourceDir + '/', "/");
                     const trueType = assetPath.split(".").pop();
                     return { ...(await acc), [assetPath]: { assetContent, trueType } };
                   }
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
               var linkTag = document.createElement('link');
               linkTag.type = 'text/css';
               linkTag.rel = 'stylesheet';
               linkTag.href = 'data:text/css;base64,' + btoa(contentString)
               document.head.appendChild(linkTag);
               console.log('[ipfs-webpack-plugin] loaded css ' + download_assets[i].filename)
             } 

             for (var i = 0; i < download_assets.length; i++) {
               if (download_assets[i].type !== 'script')
                 continue

               let content = await download_assets[i].promise
               console.log('[ipfs-webpack-plugin] loading ' + download_assets[i].filename)
               var newscript = document.createElement('script')
               newscript.text = content.toString('utf8')
               document.body.appendChild(newscript)
               console.log('[ipfs-webpack-plugin] loaded ' + download_assets[i].filename)
             }
            })().then(() => {
            }).catch((err) => {
               console.log('failed to load initial assets from ipfs: ', err)
            });
            </script>`)

            cssEle.remove()
          }
          if (!process.env.IPFS_WEBPACK_PLUGIN_NO_GETTER) {
            let getter = await this.getGetter()
            $("body").prepend(`<script>${getter}</script>`);
          }

          html = $.html()
          fs.writeFileSync(`${appDirectory}/` + this.source_dir + `/index.html`, html);
          fs.writeFileSync(`${appDirectory}/` + this.source_dir + `/index.html.br`, zlib.brotliCompressSync(Buffer.from(html, 'utf8')))
        }

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
