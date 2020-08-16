const path = require('path');
const config = require('./w.config');

// dev环境配置
module.exports = {
    devtool: config.devtool,
    entry: config.entry,
    output: {
        path: path.join(__dirname, 'build'),
        publicPath: path.join(__dirname, 'build'),
        filename: '[name].js',
    },
    // eslint: config.eslint,
    module: {
        rules: config.rules,
    },
    plugins: config.devPlugins,
    devServer: config.devServer,
    optimization: {
        minimize: false,
    },
    mode: 'development',
    // postcss: config.postcss,
};
