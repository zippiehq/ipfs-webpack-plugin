import "core-js/stable";
import "regenerator-runtime/runtime";

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
    
    window.ipfs_stub_loaded = true
