const path = require('path');

const devMode = false;

module.exports = {
  mode: devMode ? 'development' : 'production',
  entry: {
    'background': path.resolve(__dirname, './src/background.js')
    , 'content_script': path.resolve(__dirname, './src/content_script.js')
    , 'popup': path.resolve(__dirname, './src/popup.js')
    // settings
    , 'function/settings/settings': path.resolve(__dirname, './src/settings/settings.js')
    , 'function/settings/settings_import': path.resolve(__dirname, './src/settings/settings_import.js')
    // bug import
    , 'function/bug/bug_import': path.resolve(__dirname, './src/bug_import/bug_import.js')
    , 'function/bug/bug_list': path.resolve(__dirname, './src/bug_import/bug_list.js')
    , 'function/bug/collect': path.resolve(__dirname, './src/bug_import/collect.js')
  },

  output: {
    filename: '[name].min.js',
    path: path.resolve(__dirname, 'dist/')
  }
};