#!/usr/bin/env bash

mkdir -p dep

cp node_modules/bootswatch/dist/darkly/bootstrap.min.css dep
cp -R node_modules/font-awesome/css dep
cp node_modules/tablesort/tablesort.css dep

cp node_modules/jquery/dist/jquery.min.js dep
cp node_modules/popper.js/dist/umd/popper.min.js dep
cp node_modules/bootstrap/dist/js/bootstrap.min.js dep
cp node_modules/vue/dist/vue.min.js dep
cp node_modules/tablesort/dist/tablesort.min.js dep
cp node_modules/tablesort/dist/sorts/tablesort.number.min.js dep
cp -R node_modules/font-awesome/fonts dep

cp index.html dist
cp -R src dist