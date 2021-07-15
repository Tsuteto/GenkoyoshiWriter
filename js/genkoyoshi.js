import { UndoManager, CommandInsert, CommandDelete } from "./gk-undo.js";
import { CellHandler } from "./gk-cellhandlers.js";

/**
 * @typedef {*} Unistring
 */

/**
 * @typedef {Object} Options
 * @property {boolean} newlineVisible
 * @property {boolean} halfwidthSpaceVisible
 * @property {boolean} fullwidthSpaceVisible
 * @property {boolean} tatechuyoko
 * @property {boolean} sidewaysRoman
 * @property {boolean} combineRomanSentence
 * @property {boolean} combineEndOfLine
 * @property {boolean} combineEndBracket
 */

/**
 * 原稿用紙メイン
 */
export class GenkoYoshi {

    /**
     * @param {JQuery} $container 
     * @param {number} col 
     * @param {number} row 
     */
    constructor($container, col, row) {
        /** @type {JQuery} */
        this.$container = $container;
        /** @type {number} */
        this.colSize = col;
        /** @type {number} */
        this.rowSize = row;
        /** @type {string} */
        this.featuringColor = GenkoYoshi.COLOR_PALETTE[0];
        /** @type {string} */
        this.featuringFont = GenkoYoshi.DEFAULT_FONT;
        /** @type {string|null} */
        this.featuringFontRoman = null;
        /** @type {Options} */
        this.cellOptions = {
            newlineVisible: true,
            halfwidthSpaceVisible: false,
            fullwidthSpaceVisible: false,
            verticalImeInput: false,
            tatechuyoko: false,
            sidewaysRoman: false,
            combineRomanSentence: false,
            combineEndOfLine: true,
            combineEndBracket: true,
        };

        /** @type {string} */
        this.browser = (/(msie|trident|edge|chrome|safari|firefox|opera)/
                .exec(window.navigator.userAgent.toLowerCase()) || ["other"]).pop().replace("trident", "msie");

        /** @type {UndoManager} */
        this.undoMgr = new UndoManager(this);
        /** @type {TextContainer} */
        this.text = new TextContainer(this);
        /** @type {SelectState} */
        this.selectState = new SelectState();

        /** @type {number} */
        this.currPages = 0;
        /** @type {string[]} */
        this.rubyList = [];

        /** @type {Object.<number, JQuery>} */
        this.$pages = {};
        /** @type {Object.<number, TextCell>} */
        this.$charCells = {};
        /** @type {Object.<number, JQuery>} */
        this.$rubyCells = {};
        /** @type {Object.<number, TextCell>} */
        this.charPosMap = {};
        /** @type {Object.<number, JQuery>} */
        this.cellPosMap = {};
        /** @type {number} */
        this.lastCellIdx = 0;
        /** @type {number} */
        this.paperMerginTop;

        /** @type {CellHandler[]} */
        this.cellHandlerChain = CellHandler.createCellHandlerChain(this);

        let inputManagerClass = this.browser == "safari" ? InputManagerSafari : InputManager;

        /** @type {InputManager} */
        this.inputMgr = new inputManagerClass(this, this.text, this.undoMgr)
                .onTextChanged(this.onTextChanged.bind(this))
                .onCaretMoved(this.onCaretMoved.bind(this))
                .applyComponentsTo(this.$container);
    }

    init() {
        return new Promise((resolve, reject) => {
            /** @type {TextCell} */
            this.$charCells = {};
            this.$rubyCells = {};

            this.$colorCss = $("<style>");
            this.$colorCss.appendTo($("head"));
            this.$fontCss = $("<style>");
            this.$fontCss.appendTo($("head"));
            this.setColor(this.featuringColor);
            this.setFont(this.featuringFont);
            this.inputMgr.applyCellOptions(this.cellOptions);

            setTimeout(() => {
                this.addPage(0);
                this.measureMarginTop();
                this.updateText();
                this.inputMgr.focus();
                this.inputMgr.updateCaret();
                resolve();
            });

            $(window).resize(() => {
                this.measureMarginTop();
                this.inputMgr.updateCaret()
            });
        });
    }

    measureMarginTop() {
        this.paperMerginTop = $(".genko-paper").eq(0).offset().top;
    }

    setOptions(options) {
        $.extend(this, options);
        return this;
    }

    setText(input) {
        this.text.setText(input);
        return this;
    }

    getText() {
        return this.text.getText().toString();
    }

    setSize(rows, cols) {
        this.colSize = cols | 0;
        this.rowSize = rows | 0;
        this.refresh();
    }

    setRuby(rubyList) {
        this.rubyList = rubyList;
        return this;
    }

    setColor(fColor) {
        this.$colorCss.html(`:root {--grid-color: ${fColor};}`);
        this.featuringColor = fColor;
    }

    setFont(fontName) {
        this.featuringFont = fontName;
        this.updateFont();
    }

    setFontRoman(fontName) {
        this.featuringFontRoman = fontName || null;
        this.updateFont();
    }

    updateFont() {
        let fontfamily = [];
        if (GenkoYoshi.FONTS_ROMAN[this.featuringFontRoman]) {
            fontfamily.push(GenkoYoshi.FONTS_ROMAN[this.featuringFontRoman]);
        }
        fontfamily.push(GenkoYoshi.FONTS[this.featuringFont]);
        this.$fontCss.html(`.genko-body {font-family: ${fontfamily.join(", ")}, "gk-HentaiganaMincho", serif`);
//        "UniHentaiKana","IPAmjMincho","HanaMinA","WadaLabChuMaruGo2004Emoji","WadaLabMaruGo2004Emoji",serif;}`);
    }

    setCellOption(name, bool) {
        this.cellOptions[name] = bool;
        this.updateText();
        this.$container.find(".genko-paper")
                .toggleClass("newline-visible", this.cellOptions.newlineVisible)
                .toggleClass("fw-space-visible", this.cellOptions.fullwidthSpaceVisible)
                .toggleClass("hw-space-visible", this.cellOptions.halfwidthSpaceVisible);
        this.inputMgr.applyCellOptions(this.cellOptions);
    }

    buildPage(pageNum) {
        let $paper = $(`<div class="genko-paper browser-${this.browser}">`)
                .data("page", pageNum)
                .toggleClass("newline-visible", this.cellOptions.newlineVisible)
                .toggleClass("fw-space-visible", this.cellOptions.fullwidthSpaceVisible)
                .toggleClass("hw-space-visible", this.cellOptions.halfwidthSpaceVisible)
                .mouseup(this.onCharMouseup.bind(this));
        let $genko = $("<div class='genko-body'>");
        let $inner = $("<div class='inner'>");
        let isSeparatorAdded = false;

        for (let r = this.rowSize; r > 0; r--) {
            // Row
            $inner.append(this.buildRow(r + this.rowSize * pageNum));
            // Gyobi
            if (this.rowSize > 10 && r <= (this.rowSize / 2 > 10 ? this.rowSize / 2 : 10) + 1 && !isSeparatorAdded) {
                $inner.append(this.buildCenterSeparator());
                isSeparatorAdded = true;
            }
        }

        $genko.append($inner);
        $paper.append($genko);
        this.$container.append($paper);
        this.$pages[pageNum] = $paper;

        return this;
    }

    buildRow(row) {
        let $colCont = $("<div class='col-container'>");
        let $col = $("<div class='col-body'>");

        for (let c = 0; c < this.colSize; c++) {
            let cellPos = c + this.colSize * (row - 1);
            let $charRow = $("<div class='char-row'>");
            let $charRuby = $("<div class='char-ruby'>");
            let $charBody = $("<div class='char-body'>");

            $charRow.mousedown(this.onCharMousedown.bind(this))
                    .mousemove(this.onCharMousemove.bind(this));

            let $charWrapper = $("<div>");

            let $rubyWrapper = $("<div>")
                .data("pos", cellPos)
                .click(this.onRubyClicked.bind(this));

            $charRuby.append($rubyWrapper);
            $charBody.append($charWrapper);
            $charRow.append($charBody).append($charRuby);
            $col.append($charRow);

            //$charBody.append($(`<div id="charpos-${cellPos}" class="test-tip">`));

            let cell = new TextCell(cellPos, $charWrapper).setLinehead(c == 0);

            this.$charCells[cellPos] = cell;
            this.$rubyCells[cellPos] = $rubyWrapper;
            this.cellPosMap[cellPos] = cell;
        }
        $colCont.append($col);
        return $colCont;
    }

    buildCenterSeparator() {
        return $("<div class='center-container'>")
            .append($("<div class='center-separator-block'>")
                .append($("<div class='gyobi-top'>").load("./img/gyobi1-top.svg"))
                .append($("<div class='gyobi-bottom'>").load("./img/gyobi1-bottom.svg")));
    }

    updateText(startPos) {
        if (!startPos) {
            this.charPosMap = {};
        }
        let cellIdx, charPos;
        /** @type {TextCell} */
        let initialCell;
        /** @type {TextCell} */
        let prevCell;

        if (startPos) {
            initialCell = this.charPosMap[startPos].prevCell;
            cellIdx = initialCell ? initialCell.pos : 0;
            charPos = initialCell ? initialCell.charPos : 0;
            prevCell = initialCell ? initialCell.prevCell : null;
        } else {
            initialCell = null;
            cellIdx = 0;
            charPos = 0;
            prevCell = null;
        }
        this.lastCellIdx = startPos ? cellIdx : 0;
        let text = this.text.getText();
        let newline = false;
        let regexNewline = /\n|\n\r/;

        /** @type {TextCell} */
        let cell
        /** @type {Array<TextCell>} */
        let queueForNext = [];

        while ((cell = this.$charCells[cellIdx]) != null) {

            cell.attr("class", "");

            if (cellIdx % this.colSize == 0) {
                newline = false;
            }

            if (!newline) {
                let chars = new CharExtractor(text, charPos, this.browser);

                let charsInCell = 1;

                if (regexNewline.test(chars.get(1))) {
                    // New line
                    newline = true;
                    cell.addClass("newline").text("");
                } else {
                    /*
                    * Character combine logic
                    */
                    this.cellHandlerChain
                        .filter(h => h.isEnabled())
                        .some(h => {
                            if (h.matches(cellIdx, chars, this)) {
                                charsInCell = h.apply(cell, cellIdx, chars, this);
                                return true;
                            }
                        });
                        
                    if (cellIdx % this.colSize == this.colSize - 1
                            && regexNewline.test(text.clusterAt(charPos + charsInCell))) {
                        cell.addClass("newline-after");
                        charsInCell += 1;
                    }
                }

                cell.setCharPos(charPos).setCharsInCell(charsInCell).setBlank(false);
                this.charPosMap[charPos] = cell;
                //$(`#charpos-${cellIdx}`).text(charPos);

                if (charsInCell > 1) {
                    cell.addClass("combined");
                    for (let i = 0; i < charsInCell; i++) {
                        charPos++;
                        this.charPosMap[charPos] = cell;
                    }
                } else {
                    charPos++;
                }

                cell.setPrevCell(prevCell);
                if (prevCell) {
                    prevCell.setNextCell(cell);
                    let c;
                    while ((c = queueForNext.pop()) != null) {
                        c.setNextCell(cell);
                    }
                }
                prevCell = cell;
            } else {
                cell.text("");
                cell.setCharPos(charPos)
                        .setCharsInCell(0)
                        .setBlank(true)
                        .setPrevCell(prevCell);
                queueForNext.push(cell);
            }

            if (text.clusterAt(charPos)) {
                this.lastCellIdx = cellIdx;
                this.addPage(cellIdx);
            }

            cellIdx++;
        }

        this.adjustPages(this.lastCellIdx);

        for (let rubyIdx in this.$rubyCells) {
            let ruby;
            ruby = this.rubyList[rubyIdx] || "";
            this.$rubyCells[rubyIdx].text(ruby);
        }

        for (let pageIdx in this.$pages) {
            this.$pages[pageIdx].toggleClass("blank", this.lastCellIdx < this.rowSize * this.colSize * +pageIdx - 1);
        }

        this.$container.find(".genko-paper").toggleClass("sideways-roman", this.cellOptions.sidewaysRoman);

        return this;
    }

    updateTextSelection() {
        let range = this.selectState.getUpdateRange();
        if (!this.selectState.isSelecting) {
            let pos = this.selectState.getRange().start;
            this.text.setCaretPosition(pos);
        } else {
            this.text.setSelectionRange(this.selectState.getRange());
        }
        for (let charPos = range.start; charPos < range.end; charPos++) {
            let cell = this.charPosMap[charPos];
            cell.toggleClass("selected", this.selectState.isSelected(charPos));
        }
        this.inputMgr.updateCaret();
    }

    refresh() {
        this.$charCells = {};
        this.$rubyCells = {};
        this.currPages = 0;
        this.$container.find(".genko-paper").remove();
        this.addPage(0);
        this.updateText();
        this.updateTextSelection();
    }

    calcTotalPages(cellIdx) {
        let row = Math.ceil((cellIdx + 2) / this.colSize) + 1;
        return Math.max(Math.ceil(row / this.rowSize), 1);
    }

    addPage(cellIdx) {
        let page = this.calcTotalPages(cellIdx);
        if (page <= this.currPages) return;

        this.buildPage(page - 1);
        this.currPages = page;
    }

    adjustPages(cellIdx) {
        let page = this.calcTotalPages(cellIdx);
        if (page === this.currPages) return;

        for (let p = 0; p < this.currPages - page; p++) {
            this.$container.find(".genko-paper:last-child").remove();
        }
        this.currPages = page;
    }

    onTextChanged(pos) {
        this.updateText(pos);
    }

    onCharMousedown(e) {
        let pos = this.getPosClicked(e);
        this.selectState.start(pos, this.text.getLength());
        this.updateTextSelection();
    }

    onCharMouseup(e) {
        if (this.selectState.isDragging) {
            this.inputMgr.focus();
            this.selectState.end();
            this.updateTextSelection();
        }
    }

    onCharMousemove(e) {
        if (this.selectState.isDragging) {
            let pos = this.getPosClicked(e);
            let changed = this.selectState.update(pos);
            if (changed) this.updateTextSelection();
        }
    }

    onRubyClicked(e) {}

    onCaretMoved(pos) {
        this.selectState.setPos(pos, this.text.getLength())
        this.updateTextSelection();
    }

    getPosClicked(e) {
        /** @type {TextCell} */
        let cell = $(e.currentTarget).find(".char-body div").data("cell");
        let pos = cell.charPos;
        let mpos = e.offsetY / cell.$elem.height();
        return cell.isBlank ? pos : (mpos > 0.6 ? pos + 1 : pos);
    }

    selectAll() {
        this.selectState.selectRange(0, this.text.getLength());
        this.text.setSelectionRange(this.selectState.getRange());
        let range = this.selectState.getUpdateRange();
        this.updateTextSelection(range);
    }

    undo() {
        this.undoMgr.undo();
    }

    redo() {
        this.undoMgr.redo();
    }


    clear() {
        this.text.setText("");
        this.updateText();
    }
}

export class CharExtractor {
    /**
     * @param {Unistring} text
     * @param {number} pos
     */
    constructor(text, pos, browser) {
        this.text = text;
        this.pos = pos;
        this.browser = browser;
        this.cache = {}
        this.cache[1] = this.extract(1);
    }

    extract(len) {
        let chars = this.text.substr(this.pos, len).toString();
        if (this.browser == "safari") {
            // Replace 3-dot ellipsis
            return chars.replaceAll("…", "︙");
        } else {
            return chars;
        }
    }

    get(len) {
        if (this.cache[len]) {
            return this.cache[len];
        } else {
            let chars = this.extract(len);
            this.cache[len] = chars;
            return chars;
        }
    }
}

export class TextCell {

    /**
     * 
     * @param {number} pos 
     * @param {JQuery} $elem 
     */
    constructor(pos, $elem) {
        /** @type {number} */
        this.pos = pos;
        /** @type {JQuery} */
        this.$elem = $elem.data("cell", this);
        /** @type {boolean} */
        this.isBlank = true;
        this.charPos = 0;
        this.charsInCell = 0;
        this.isLinehead = false;
        this.isLinetail = false;

        this.prevCell = null;
        this.nextCell = null;
    }

    setPrevCell(cell) {
        this.prevCell = cell
        return this;
    }
    setNextCell(cell) {
        this.nextCell = cell;
        return cell;
    }

    text(text) {
        this.$elem.text(text);
        return this;
    }
    attr(k, v) {
        this.$elem.attr(k, v);
        return this;
    }
    addClass(k) {
        this.$elem.addClass(k);
        return this;
    }
    toggleClass(k, c) {
        this.$elem.toggleClass(k, c);
        return this;
    }
    hasClass(c) {
        return this.$elem.hasClass(c);
    }

    append(e) {
        this.$elem.append(e);
        return this;
    }

    setCharPos(pos) {
        this.charPos = pos;
        return this;
    }
    setCharsInCell(num) {
        this.charsInCell = num;
        return this;
    } 
    setBlank(b) {
        this.isBlank = b;
        return this;
    }
    setLinehead(bool) {
        this.isLinehead = bool;
        return this;
    }
    setLinetail(bool) {
        this.isLinetail = bool;
        return this;
    }
}

class TextContainer {
    constructor(genko) {
        /** @type {GenkoYoshi} */
        this.genko = genko;
        this.text = new Unistring("");
        this.selectionStart = 0;
        this.selectionEnd = 0;
    }

    getText() {
        return this.text;
    }

    setText(input) {
        this.text = new Unistring(input);
    }

    getSelectedText() {
        return this.text.slice(this.selectionStart, this.selectionEnd);
    }

    getLength() {
        return this.text.length;
    }

    getRowPosFromCharPos(charPos) {
        return this.genko.charPosMap[charPos].pos % this.genko.colSize
    }
    getRowPosFromCellPos(cellPos) {
        return cellPos % this.genko.colSize
    }

    insertText(input) {
        let currText = this.text;
        this.genko.undoMgr.beginStep();

        if (this.isRangeSelection()) {
            this.genko.undoMgr.record(
                    new CommandDelete(this.selectionStart, this.getSelectedText()));
        }

        let surro = new Unistring(input.replace(/\r\n/g, "\n"));
        let before = currText.slice(0, this.selectionStart);
        let after = currText.slice(this.selectionEnd, currText.length);
        this.text = before.clone().concat(surro).concat(after);

        this.genko.undoMgr.record(
                new CommandInsert(this.selectionStart, surro));
        this.genko.undoMgr.commitStep();

        let nextPos = before.length + surro.length;
        return {nextPos: nextPos, updatePos: before.length};
    }

    backspace() {
        let start = this.isRangeSelection() ? this.selectionStart : this.selectionStart - 1;
        let end = this.selectionEnd;
        if (start < 0) return {nextPos: 0, updatePos: 0};
        let currText = this.text;
        let before = currText.slice(0, start);
        let after = currText.slice(end, currText.length);
        this.text = before.clone().concat(after);

        this.genko.undoMgr.beginStep();
        this.genko.undoMgr.record(
                new CommandDelete(start, currText.slice(start, end)));
        this.genko.undoMgr.commitStep();
        return {nextPos: start, updatePos: start};
    }

    newline() {
        return this.insertText("\n");
    }

    isNewline(pos) {
        return this.text[pos] ? this.text[pos][0] == "\n" : false;
    }

    setCaretPosition(pos) {
        pos = Math.max(0, Math.min(this.text.length, pos));
        this.selectionStart = pos;
        this.selectionEnd = pos;
    }

    setSelectionRange(range) {
        this.selectionStart = Math.min(range.start, range.end);
        this.selectionEnd = Math.max(range.start, range.end);
    }

    isRangeSelection() {
        return this.selectionStart !== this.selectionEnd;
    }
}

class SelectState {
    constructor() {
        /** @type {boolean} */
        this.isSelecting = false;
        /** @type {boolean} */
        this.isDragging = false;
        /** @type {number} */
        this.origin = 1;
        /** @type {number} */
        this.dest = 1;
        /** @type {number} */
        this.len = 0;
        this.prevOrigin = 1;
        /** @type {number} */
        this.prevDest = 1;
    }

    /**
     * 
     * @param {number} pos 
     * @param {number} len 
     */
    start(pos, len) {
        this.len = len;
        this.isDragging = true;
        this.isSelecting = false;
        this.prevOrigin = this.origin;
        this.prevDest = this.dest;
        this.origin = Math.min(len, pos);
        this.dest = Math.min(len, pos);
    }

    /**
     * 
     * @param {number} pos 
     * @returns {boolean}
     */
    update(pos) {
        let nextDest = Math.min(this.len, pos)
        let changed = this.dest !== nextDest;
        this.prevDest = this.dest;
        this.dest = nextDest;
        this.isSelecting = this.origin != this.dest;
        return changed;
    }

    end() {
        this.isDragging = false;
    }

    /**
     * 
     * @param {number} start 
     * @param {number} end 
     */
    selectRange(start, end) {
        this.origin = start;
        this.dest = end;
        this.len = end;
        this.isSelecting = this.origin != this.dest;
    }

    setPos(pos, len) {
        this.prevOrigin = this.origin;
        this.prevDest = this.dest;
        this.origin = pos;
        this.dest = pos;
        this.len = len;
        this.isSelecting = false;
    }

    /**
     * 
     * @returns {{start: number, end: number}}
     */
    getRange() {
        return {
            start: this.origin > this.dest ? this.dest : this.origin,
            end: this.origin < this.dest ? this.dest : this.origin
        };
    }

    getUpdateRange() {
        return {
            start: Math.min(this.origin, this.prevOrigin, this.dest, this.prevDest),
            end: Math.max(this.origin, this.prevOrigin, this.dest, this.prevDest)
        };
    }

    /**
     * 
     * @param {number} pos 
     * @returns {boolean}
     */
    isSelected(pos) {
        if (this.isSelecting) {
            let range = this.getRange();
            return pos >= range.start && pos < range.end;
        } else {
            return false;
        }
    }
}

class InputManager {
    /**
     * 
     * @param {GenkoYoshi} genko 
     * @param {TextContainer} text 
     * @param {UndoManager} undoMgr 
     */
    constructor(genko, text, undoMgr) {
        /** @type {GenkoYoshi} */
        this.genko = genko;
        /** @type {TextContainer} */
        this.text = text;
        /** @type {UndoManager} */
        this.undoMgr = undoMgr;

        /** @type {boolean} */
        this.isImeActive = false;
        /** @type {JQuery} */
        this.$imeFld = $("<div class='genko-ime hidden'>")
                .attr("contentEditable", "true")
                .attr("tabindex", -1)
                .keydown(this.onTextInput.bind(this))
                .on("input", this.onKeyup.bind(this))
                .on("compositionstart", this.onImeStart.bind(this))
                .on("compositionend", this.onImeClosed.bind(this))
                .blur(this.onBlur.bind(this))
                .on("paste", this.onPaste.bind(this));
        /** @type {JQuery} */
        this.$caret = $("<div class='genko-caret'>").hide();
        /** @type {JQuery} */
        this.$copybox = $("<textarea>", {className: "copybox"});

        /** @type {object|null} */
        this.caretTimer = null;

        /** @type {function|null} */
        this._onTextChanged = null;
    }

    /**
     * 
     * @param {JQuery} $parent 
     * @returns 
     */
    applyComponentsTo($parent) {
        $parent.append(this.$imeFld).append(this.$caret);
        return this;
    }

    applyImeText(data) {
        if (!this.isImeActive && this.$imeFld.text().length > 0) {
            let posObj = this.text.insertText(data != undefined ? data : this.$imeFld.text());
            this.$imeFld.text(data != undefined ? this.$imeFld.text().substr(data.length) : "");
            this._onTextChanged(posObj.updatePos);
            this._onCaretMoved(posObj.nextPos);
        }
    }

    applyCellOptions(options) {
        this.$imeFld.toggleClass("genko-ime-vertical", options.verticalImeInput);
    }

    /**
     * 
     * @param {function} handler 
     * @returns 
     */
    onTextChanged(handler) {
        this._onTextChanged = handler;
        return this;
    }

    onCaretMoved(handler) {
        this._onCaretMoved = handler;
        return this;
    }

    focus() {
        this.$caret.show();
        this.$imeFld.focus();
    }

    /**
     * @param {JQuery.KeyDownEvent} e 
     * @returns {void}
     */
    onTextInput(e) {
        let isCtrlDown = e.ctrlKey !== e.metaKey;
        let key = e.originalEvent.key;
        // event.isComponent can't be used
        // because of Safari which brings FALSE when an enter key is pressed to finish kanji process.
        if (this.isImeActive || isCtrlDown && (key == "Meta" || key == "Ctrl")) return;

        this.$caret.addClass("editing");
        clearTimeout(this.caretTimer);
        this.caretTimer = setTimeout(() => {
            this.$caret.removeClass("editing");
        }, 100);

        if (isCtrlDown) {
            switch (key) {
                case "a":
                    this.genko.selectAll();
                    e.preventDefault();
                break;
                case "c":
                    this.onCopy();
                    e.preventDefault();
                break;
                case "x":
                    this.onCut();
                    e.preventDefault();
                break;
                case "y":
                    if (e.ctrlKey) {
                        // Ctrl+Y in Windows
                        this.onRedo();
                        e.preventDefault();
                    }
                    break;
                case "z":
                    if (e.metaKey && e.shiftKey) {
                        // Command+Shift+Z in Mac
                        this.onRedo();
                        e.preventDefault();
                    } else {
                        // Ctrl+Z in Windows or Command+Z in Mac
                        this.onUndo();
                        e.preventDefault();
                    }
                    break;
                default:
            }
        } else {
            switch (key) {
                case "Backspace":
                    this.onBackspace();
                    break;
                case "Enter":
                    let posObj = this.text.newline();
                    this._onTextChanged(posObj.updatePos);
                    this._onCaretMoved(posObj.nextPos)
                    e.preventDefault();
                    break;
                case "ArrowUp":
                    this.moveCaretBack();
                    e.preventDefault();
                    break;
                case "ArrowDown":
                    this.moveCaretForward();
                    e.preventDefault();
                    break;
                case "ArrowRight":
                    this.moveCaretHorizontal(-1);
                    e.preventDefault();
                    break;
                case "ArrowLeft":
                    this.moveCaretHorizontal(1);
                    e.preventDefault();
                    break;
                case "Process":
                    setTimeout(this.applyImeText.bind(this, e.originalEvent.data));
                    e.preventDefault();
                    break;
                default:
            }
        }
    }

    /**
     * @param {JQuery.KeyUpEvent} e 
     * @returns {void}
     */
     onKeyup(e) {
        this.applyImeText();
    }

    /**
     * @param {JQuery.Event} e 
     * @returns {void}
     */
     onImeStart(e) {
        this.isImeActive = true;
        this.$imeFld.removeClass("hidden");
        this.setImePosition();
    }

    /**
     * @param {JQuery.Event} e 
     * @returns {void}
     */
     onImeClosed(e) {
        this.isImeActive = false;
        this.$imeFld.addClass("hidden");
        this.applyImeText();
    }

    onBlur() {
        this.$caret.hide();
    }

    onPaste(e) {
        e.preventDefault();

        let text = e.originalEvent.clipboardData.getData('text');
        let posObj = this.text.insertText(text);
        this._onTextChanged(posObj.updatePos);
        this._onCaretMoved(posObj.nextPos);
        this.focus();
    }

    onCopy() {
        let text = this.text.getSelectedText().toString();
        if (!text) return;

        this.genko.$container.append(this.$copybox);
        this.$copybox.text(text).select();
        document.execCommand("copy");
        this.$copybox.remove();
        this.focus();
    }

    onCut() {
        this.onCopy();
        let posObj = this.text.backspace();
        this._onTextChanged(posObj.updatePos);
        this._onCaretMoved(posObj.nextPos);
}

    onUndo() {
        this.undoMgr.undo();
    }

    onRedo() {
        this.undoMgr.redo();
    }

    onBackspace() {
        let posObj = this.text.backspace();
        this._onTextChanged(posObj.updatePos);
        this._onCaretMoved(posObj.nextPos);
    }

    moveCaretBack() {
        /** @type {TextCell} */
        let prevCell = this.genko.charPosMap[this.text.selectionStart].prevCell;
        this._onCaretMoved(prevCell ? prevCell.charPos : 0);
    }

    moveCaretForward() {
        /** @type {TextCell} */
        let nextCell = this.genko.charPosMap[this.text.selectionEnd].nextCell;
        this._onCaretMoved(nextCell.charPos);
    }

    moveCaretHorizontal(dir) {
        let afterLinebreak = false;
        let currRowPos = this.text.getRowPosFromCharPos(this.text.selectionEnd);
        let nextCharPos = this.text.selectionEnd;

        for (let i = 0; i < this.text.getLength(); i++) {
            nextCharPos = this.text.selectionEnd + (i + 1) * dir;
            if (nextCharPos <= 0) {
                nextCharPos = 0;
                break;
            } else if (nextCharPos > this.text.getLength()) {
                break;
            }
            let rowPos = this.text.getRowPosFromCharPos(nextCharPos);
            if (rowPos == 0) {
                afterLinebreak = true;
            }
            if (dir > 0 && (rowPos == currRowPos || this.text.isNewline(nextCharPos) && afterLinebreak)) {
                break;
            }
            if (dir < 0 && (rowPos == currRowPos || this.text.isNewline(nextCharPos) && rowPos <= currRowPos && afterLinebreak)) {
                break;
            }
        }
        this._onCaretMoved(nextCharPos);
    }

    updateCaret() {
        var pos = this.text.selectionEnd;
        var cell = this.genko.charPosMap[pos];
        if (cell.hasClass("combined") && cell.pos != pos) {
            cell = cell.nextCell;
        }
        var caretOffset = cell.$elem.offset();
        this.$caret.offset(caretOffset);
        this.setImePosition();

        // Adjust the paper position where the caret is in to the center of screen
        let scrollTo = cell.$elem.closest(".genko-paper").offset().top - this.genko.paperMerginTop;
        if (Math.abs($("html").scrollTop() - scrollTo) > this.genko.paperMerginTop) {
            $("html:not(:animated)").animate({scrollTop: scrollTo}, 300);
        }
    }

    setImePosition() {
        let pos = this.text.selectionEnd;
        /** @type {TextCell} */
        let cell = this.genko.charPosMap[pos];
        let inputOffset = cell.$elem.offset();
        inputOffset.top += 0;
        if (this.genko.cellOptions.verticalImeInput) {
            inputOffset.left -= this.$imeFld.outerWidth() + 5;
        } else {
            inputOffset.left += cell.$elem.outerWidth() + 5;
        }
        this.$imeFld.offset(inputOffset);
    }
}

class InputManagerSafari extends InputManager {
    constructor(genko, text, undoMgr) {
        super(genko, text, undoMgr);
        this.waitingEnter = false;
    }

    onTextInput(e) {
        let key = e.originalEvent.key;
        if (this.waitingEnter && key == "Enter") {
            this.waitingEnter = false;
        } else {
            super.onTextInput(e);
        }
    }

    onImeClosed(e) {
        this.waitingEnter = true;
        super.onImeClosed(e);
    }
}

// For old Safari, static class fields define outside the class
/** @type {string[]} */
GenkoYoshi.COLOR_PALETTE = [
    "#9cca9c", // green
    "#b96976", // brown
    "#c2a081", // red
    "#d66085", // pink
    "#6e72a7", // violet
    "#5080bf", // blue
    "#74afb3", // cyan
    "#b6bd57", // yellow
    "#a973af", // purple
    "#ccdde3", // pale ice
    "#007322", // dark green
    "#acacac", // gray
    "#202020" // black
];

/** @type {Object.<string,string>} */
GenkoYoshi.FONTS = {
    "YuMin": `"Yu Mincho", YuMincho`,
    "YuMin_36pKn": `YuMin_36pKn, "YuMincho +36p Kana"`,
    "HiraginoMin": `"Hiragino Mincho ProN", "Hiragino Mincho Pro", "ヒラギノ明朝 ProN W3"`,
    "BIZUDMin": `"BIZ UDMincho"`,
    "BunkyuMin": `"Toppan Bunkyu Mincho"`,
    "KozukaMin": `"KozMinPr6N", "Kozuka Mincho Pr6N", "Kozuka Mincho Pro"`,
    "NotoSerif": `Noto Serif JP`,
    "HGMin": `"HG明朝B"`,
    "HeiseiMin": `"平成明朝体 Ｗ３", "HeiseiMincho-W3", "HG平成明朝体W3"`,
    "MSMin": `"ＭＳ 明朝", "MS Mincho"`,

    "UDKyo": `"UD Digi Kyokasho N-R"`,
    "HGKyo": `"HGP教科書体"`,
    "DFKyo": `"DFKyoKaSho-W3"`,
    "YuKyo": `YuKyo, "Yu Kyokasho", YuKyokasho`,
    "Klee": `Klee`,

    "HGGyo": `"HGP行書体"`,
    "ArisawaKai": `"有澤楷書"`,
    "TsukushiARGo": `"Tsukushi A Round Gothic", "TsukuARdGothic"`,
    "TsukushiBRGo": `"Tsukushi B Round Gothic", "TsukuBRdGothic"`
};

/** @type {Object.<string,string>} */
GenkoYoshi.FONTS_ROMAN = {
    "Times": "gk-Times",
    "Century": "gk-Century",
    "Garamond": "gk-Garamond",
    "Palatino": "gk-Palatino",
    "Lucida": "gk-Lucida",
    "Rockwell": "gk-Rockwell",
    "Bookman": "gk-Bookman",
    "Georgia": "gk-Georgia",
    "Typewriter": "gk-Typewriter",
    "Courier": "gk-Courier"
};

/** @type {string} */
GenkoYoshi.DEFAULT_FONT = "YuMin";
