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
  }
}