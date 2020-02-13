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
const fs = require("fs");
const cheerio = require("cheerio");
const webpack = require("webpack");
const dotenv = require('dotenv')
const fetch = require('node-fetch');
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
    let fastpeer = process.env.IPFS_WEBPACK_JSIPFS_FASTPEER ? 'https://de-ipfsfp.dev.zippie.org' : process.env.IPFS_WEBPACK_JSIPFS_FASTPEER
    if (process.env.IPFS_WEBPACK_JSIPFS_GETTER) {
      code = `
      import * as IPFS from 'ipfs';
      import * as multihash from 'multihashes'
      import * as multihashing from 'multihashing-async'
      import * as Block from 'ipfs-block'
  
      var bootstrap = ["/dns4/ipfstest.zippie.org/tcp/443/wss/ipfs/QmSjrxBW9vwj4Cm1LyodeqzUGkCvZXQjREY7zogWXxE6ne"]
      window.ipfs = new IPFS({config: {Bootstrap: bootstrap}, preload: {enabled: false } })
      window.ipfs_fastpeer = '${fastpeer}'
      class FastPeer {
      constructor(realbitswap) {
      this._realbitswap = realbitswap
    }
    async get(cid) {
      let has_cid_locally = await this._realbitswap.blockstore.has(cid)
  
      if (!has_cid_locally) {
        try {
          let res = await fetch(window.ipfs_fastpeer + '/api/v0/block/get/' + cid.toString(), {cache: 'force-cache'})
          if (res.status === 200) {
            let buf = Buffer.from(await res.arrayBuffer())
            let m = multihash.decode(cid.multihash)
            if (cid.multihash.equals(await multihashing(buf, m.code))) {
              console.log('fetched ' + cid.toString())
              return new Block(buf, cid)
            }
            console.info('data mismatch from fast peer')
          }
        } catch (err) {
          console.log('something broke: ' + err)
        }
      }
      return this._realbitswap.get(cid)
    }
  
    async getMany(cids) {
      console.log('getMany ' + cids)
  
      return this._realbitswap.getMany(cids)
    }
  
    async put(block) {
      console.log('put ' + block)
      return this._realbitswap.put(block)
    }
  
    async putMany(blocks) {
      console.log('putMany ' + blocks)
      return this._realbitswap.putMany(blocks)
    }
  }
      window.ipfs.on('ready', async () => {
         window.ipfs._blockService.setExchange(new FastPeer(window.ipfs._blockService._bitswap))
         console.log('set exchange sorted out')
      })`

    } else {
      code = `
    import { createProxyClient } from "@zippie/ipfs-postmsg-proxy";

    if (!window.ipfs) {
      window.ipfs = createProxyClient({
         postMessage: function(message, origin) {
            return window.parent.postMessage(message, origin)
         }
      })
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
     
      IPFS.create({repo: this.ipfs_repo, start: false}).then(async (ipfs) => {
        this.ipfs = ipfs
        var result = await this.ipfs.addFromFs(
          this.source_dir,
          {
            recursive: true,
            ignore: this.wrapper_list,
            wrapWithDirectory: false
          })

          result.map(file => {
            filelist = {
              ...filelist,
              [file.path]: {
                path: file.path,
                hash: file.hash,
                size: file.size
              }
            };
          });

          const html = fs.readFileSync(`${appDirectory}/` + this.source_dir + `/index.html`);
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
              await window.ipfs.ready
              for (var i = 0; i < css.length; i++) {
                 var hash = window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + css[i]].hash
                 var brotli = false
                 if (window.brotli_decompress && window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + css[i] + '.br']) {
                    brotli = true
                    hash = window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + css[i] + '.br'].hash
                 }

                 console.log('[ipfs-webpack-plugin] grabbing ' + css[i] + ' from ' + hash + ' brotli: ' + brotli)
                 
                 var content = await window.ipfs.cat(hash, {})
                 if (brotli) {
                    content = window.brotli_decompress(content)
                 }

                 console.log('[ipfs-webpack-plugin] downloaded ' + css[i] + ' brotli: ' + brotli)
                 var linkTag = document.createElement('link');
                 linkTag.type = 'text/css';
                 linkTag.rel = 'stylesheet';
                 linkTag.href = 'data:text/css;base64,' + content.toString('base64')
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
              await window.ipfs.ready
              for (var i = 0; i < scripts.length; i++) {
                 var hash = window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + scripts[i]].hash
                 var brotli = false
                 if (window.brotli_decompress && window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + scripts[i] + '.br']) {
                    brotli = true
                    hash = window.ipfsWebpackFiles[window.ipfsWebpackSourceDir + scripts[i] + '.br'].hash
                 }

                 console.log('[ipfs-webpack-plugin] grabbing ' + scripts[i] + ' from ' + hash + ' brotli: ' + brotli)
                 
                 var content = await window.ipfs.cat(hash, {})
                 if (brotli) {
                    content = window.brotli_decompress(content)
                 }

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
          fs.writeFileSync(`${appDirectory}/` + this.source_dir + `/index.html`, $.html());
          result = await this.ipfs.addFromFs(
            this.source_dir,
            {
              recursive: true,
              wrapWithDirectory: false
            })
            var filelist
            result.map(file => {
              filelist = {
                ...filelist,
                [file.path]: {
                  path: file.path,
                  hash: file.hash,
                  size: file.size
                }
              };
            });
            fs.writeFileSync(
              `${appDirectory}/` + this.ipfs_filelist,
              JSON.stringify(filelist)
            );          
            console.log('IPFS CID: ' + filelist[this.source_dir].hash) 
            callback();
      }).catch((err) => {
        console.log(err)
      })
    });
  }
}

module.exports = IpfsPlugin;
