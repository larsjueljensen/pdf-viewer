const path = require('path');

module.exports = {
    mode: 'development',
    entry: {
        "pdf-viewer": './src/index.ts'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
        publicPath: "/"
    },
    module: {
        rules: [
            {
                test: /pdf\.worker\.min\.mjs$/,
                use: 'raw-loader'
            },
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-typescript'],
                    },
                },
            }
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    devServer: {
        proxy: {
            '/basics.pdf': {
                target: 'https://pdfa.org',
                pathRewrite: {'^/basics.pdf' : '/wp-content/uploads/2023/08/PDF-Basics-CheatSheet.pdf'},
                secure: false,
                changeOrigin: true
            },
            '/graphics.pdf': {
                target: 'https://pdfa.org',
                pathRewrite: {'^/graphics.pdf' : '/wp-content/uploads/2023/08/PDF-Operators-CheatSheet.pdf'},
                secure: false,
                changeOrigin: true
            },
            '/objects.pdf': {
                target: 'https://pdfa.org',
                pathRewrite: {'^/objects.pdf' : '/wp-content/uploads/2023/08/PDF-CommonObjects-CheatSheet.pdf'},
                secure: false,
                changeOrigin: true
            },
            '/color.pdf': {
                target: 'https://pdfa.org',
                pathRewrite: {'^/color.pdf' : '/wp-content/uploads/2023/08/PDF-Color-CheatSheet.pdf'},
                secure: false,
                changeOrigin: true
            }
        },
        compress: true
    }
};
