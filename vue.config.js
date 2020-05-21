const webpack = require('webpack')

module.exports = {
  configureWebpack: {
    resolve: {
      extensions: ['.js'],
      alias: {
        'jquery': 'jquery/dist/jquery.js',
      }
    },
    plugins: [
      new webpack.ProvidePlugin({
        '$': 'jquery',
        jQuery: 'jquery',
      })
    ]
  },
  pluginOptions: {
    electronBuilder: {
      builderOptions: {
        appId: "com.sampalest.cryptox",
        productName: "Cryptox",
        copyright: "Copyright © 2020 Samuel Palomo Esteban",
        fileAssociations: {
          ext: "ctx",
          name: "CTX",
          role: "Editor",
          description: "Cryptox file encrypted"
        },
        mac: {
          category: "public.app-category.utilities",
          identity: "sampalest@icloud.com",
          darkModeSupport: false,
          type: "distribution",    
          target: [
            "dmg",
            "zip"
          ]
        }
      }
    }
  }
}