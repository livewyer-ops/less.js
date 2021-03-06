"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var contexts_1 = __importDefault(require("../contexts"));
var visitor_1 = __importDefault(require("./visitor"));
var import_sequencer_1 = __importDefault(require("./import-sequencer"));
var utils = __importStar(require("../utils"));
var ImportVisitor = function (importer, finish) {
    this._visitor = new visitor_1.default(this);
    this._importer = importer;
    this._finish = finish;
    this.context = new contexts_1.default.Eval();
    this.importCount = 0;
    this.onceFileDetectionMap = {};
    this.recursionDetector = {};
    this._sequencer = new import_sequencer_1.default(this._onSequencerEmpty.bind(this));
};
ImportVisitor.prototype = {
    isReplacing: false,
    run: function (root) {
        try {
            // process the contents
            this._visitor.visit(root);
        }
        catch (e) {
            this.error = e;
        }
        this.isFinished = true;
        this._sequencer.tryRun();
    },
    _onSequencerEmpty: function () {
        if (!this.isFinished) {
            return;
        }
        this._finish(this.error);
    },
    visitImport: function (importNode, visitArgs) {
        var inlineCSS = importNode.options.inline;
        if (!importNode.css || inlineCSS) {
            var context = new contexts_1.default.Eval(this.context, utils.copyArray(this.context.frames));
            var importParent = context.frames[0];
            this.importCount++;
            if (importNode.isVariableImport()) {
                this._sequencer.addVariableImport(this.processImportNode.bind(this, importNode, context, importParent));
            }
            else {
                this.processImportNode(importNode, context, importParent);
            }
        }
        visitArgs.visitDeeper = false;
    },
    processImportNode: function (importNode, context, importParent) {
        var evaldImportNode;
        var inlineCSS = importNode.options.inline;
        try {
            evaldImportNode = importNode.evalForImport(context);
        }
        catch (e) {
            if (!e.filename) {
                e.index = importNode.getIndex();
                e.filename = importNode.fileInfo().filename;
            }
            // attempt to eval properly and treat as css
            importNode.css = true;
            // if that fails, this error will be thrown
            importNode.error = e;
        }
        if (evaldImportNode && (!evaldImportNode.css || inlineCSS)) {
            if (evaldImportNode.options.multiple) {
                context.importMultiple = true;
            }
            // try appending if we haven't determined if it is css or not
            var tryAppendLessExtension = evaldImportNode.css === undefined;
            for (var i = 0; i < importParent.rules.length; i++) {
                if (importParent.rules[i] === importNode) {
                    importParent.rules[i] = evaldImportNode;
                    break;
                }
            }
            var onImported = this.onImported.bind(this, evaldImportNode, context);
            var sequencedOnImported = this._sequencer.addImport(onImported);
            this._importer.push(evaldImportNode.getPath(), tryAppendLessExtension, evaldImportNode.fileInfo(), evaldImportNode.options, sequencedOnImported);
        }
        else {
            this.importCount--;
            if (this.isFinished) {
                this._sequencer.tryRun();
            }
        }
    },
    onImported: function (importNode, context, e, root, importedAtRoot, fullPath) {
        if (e) {
            if (!e.filename) {
                e.index = importNode.getIndex();
                e.filename = importNode.fileInfo().filename;
            }
            this.error = e;
        }
        var importVisitor = this;
        var inlineCSS = importNode.options.inline;
        var isPlugin = importNode.options.isPlugin;
        var isOptional = importNode.options.optional;
        var duplicateImport = importedAtRoot || fullPath in importVisitor.recursionDetector;
        if (!context.importMultiple) {
            if (duplicateImport) {
                importNode.skip = true;
            }
            else {
                importNode.skip = function () {
                    if (fullPath in importVisitor.onceFileDetectionMap) {
                        return true;
                    }
                    importVisitor.onceFileDetectionMap[fullPath] = true;
                    return false;
                };
            }
        }
        if (!fullPath && isOptional) {
            importNode.skip = true;
        }
        if (root) {
            importNode.root = root;
            importNode.importedFilename = fullPath;
            if (!inlineCSS && !isPlugin && (context.importMultiple || !duplicateImport)) {
                importVisitor.recursionDetector[fullPath] = true;
                var oldContext = this.context;
                this.context = context;
                try {
                    this._visitor.visit(root);
                }
                catch (e) {
                    this.error = e;
                }
                this.context = oldContext;
            }
        }
        importVisitor.importCount--;
        if (importVisitor.isFinished) {
            importVisitor._sequencer.tryRun();
        }
    },
    visitDeclaration: function (declNode, visitArgs) {
        if (declNode.value.type === 'DetachedRuleset') {
            this.context.frames.unshift(declNode);
        }
        else {
            visitArgs.visitDeeper = false;
        }
    },
    visitDeclarationOut: function (declNode) {
        if (declNode.value.type === 'DetachedRuleset') {
            this.context.frames.shift();
        }
    },
    visitAtRule: function (atRuleNode, visitArgs) {
        this.context.frames.unshift(atRuleNode);
    },
    visitAtRuleOut: function (atRuleNode) {
        this.context.frames.shift();
    },
    visitMixinDefinition: function (mixinDefinitionNode, visitArgs) {
        this.context.frames.unshift(mixinDefinitionNode);
    },
    visitMixinDefinitionOut: function (mixinDefinitionNode) {
        this.context.frames.shift();
    },
    visitRuleset: function (rulesetNode, visitArgs) {
        this.context.frames.unshift(rulesetNode);
    },
    visitRulesetOut: function (rulesetNode) {
        this.context.frames.shift();
    },
    visitMedia: function (mediaNode, visitArgs) {
        this.context.frames.unshift(mediaNode.rules[0]);
    },
    visitMediaOut: function (mediaNode) {
        this.context.frames.shift();
    }
};
exports.default = ImportVisitor;
//# sourceMappingURL=import-visitor.js.map