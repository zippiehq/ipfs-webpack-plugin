
const PolyfillIPFSScriptSrc = require('./PolyfillIPFSScriptSrc.js')
const IpfsWebpackPlugin = require('./index.js')
const base64Loader = require('craco-base64-inline-loader')

module.exports = {
    overrideCracoConfig: ({ cracoConfig, pluginOptions, context: { env, paths } }) => { 
      cracoConfig.plugins.push(
      { 
        plugin: base64Loader,
        options: {
          test: /\.(ttf|eot|otf|svg|woff(2)?)$/i,
          limit: 99999999999999999999,
        }
      })
    }
    overrideWebpackConfig: ({ webpackConfig, cracoConfig, pluginOptions, context: { env, paths } }) => {
      webpackConfig.plugins.unshift(new PolyfillIPFSScriptSrc())
      webpackConfig.plugins.push(new IpfsWebpackPlugin())

      // Always return the config object.
      return webpackConfig
    }
};
