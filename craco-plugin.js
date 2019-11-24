
const { loaderByName, addBeforeLoader } = require('@craco/craco')
const PolyfillIPFSScriptSrc = require('./PolyfillIPFSScriptSrc.js')
const IpfsWebpackPlugin = require('./index.js')

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
      return cracoConfig
    },
    overrideWebpackConfig: ({ webpackConfig, cracoConfig, pluginOptions, context: { env, paths } }) => {
      let loader = 'base64-inline-loader?limit=99999999999999999999'
      const base64Loader = {
        test: /\.(ttf|eot|otf|svg|woff(2)?)$/i,
        use: loader
      }
      addBeforeLoader(webpackConfig, loaderByName('file-loader'), base64Loader)

      webpackConfig.plugins.unshift(new PolyfillIPFSScriptSrc())
      webpackConfig.plugins.push(new IpfsWebpackPlugin())

      // Always return the config object.
      return webpackConfig
    }
};
