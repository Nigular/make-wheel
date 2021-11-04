const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

//解析单个模块
function getModuleInfo(file) {
  //获取文件内容[字符串]
  let content = fs.readFileSync(file, "utf8");
  //把字符串内容解释为抽象语法树
  const ast = parser.parse(content, {
    sourceType: "module",
  });
  const deps = {};
  traverse(ast, {
    //收集Import的节点
    ImportDeclaration({ node }) {
      const dirname = path.dirname(file);
      const abspath = "./" + path.join(dirname, node.source.value);
      deps[node.source.value] = abspath;
    },
  });
  //把代码里的ES6语法转为ES5
  const { code } = babel.transformFromAst(ast, null, {
    presets: ["@babel/preset-env"],
  });
  //最后输出对象：{文件，依赖，代码字符串}
  const moduleInfo = {
    file,
    deps,
    code,
  };
  return moduleInfo;
}

//从入口文件开始，解析多个模块
function parseModules(file) {
  const entry = getModuleInfo(file);
  const temp = [entry];
  const depsGraph = {};
  getDeps(temp, entry);
  temp.forEach((moduleInfo) => {
    depsGraph[moduleInfo.file] = {
      deps: moduleInfo.deps,
      code: moduleInfo.code,
    };
  });
  return depsGraph;
}

//通过递归查找出所有的依赖
function getDeps(temp, { deps }) {
  Object.keys(deps).forEach((key) => {
    const subModule = getModuleInfo(key);
    temp.push(subModule);
    getDeps(temp, subModule);
  });
}

/**
 * @param {string} 打包入口文件
 * @returns 打包后bundle代码
 */
function bundle(file) {
  const depsGraph = JSON.stringify(parseModules(file));
  return `(function (graph) {
          function require(file) {
              function absRequire(relPath) {
                  return require(graph[file].deps[relPath])
              }
              var exports = {};
              (function (require,exports,code) {
                  eval(code)
              })(absRequire, exports, graph[file].code)
              return exports
          }
          require('${file}')
      })(${depsGraph})`;
}

const content = bundle("./index.js");

//把打包后的代码写进去bundle.js里
!fs.existsSync("./dist") && fs.mkdirSync("./dist");
fs.writeFileSync("./dist/bundle.js", content);