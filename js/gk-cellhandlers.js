import {CharExtractor, GenkoYoshi} from "./genkoyoshi.js";

/**
 * マス内文字組みハンドラ
 */
export class CellHandler {
    /**
     * @param {GenkoYoshi} genko
     * @returns {CellHandler[]}
     */
    static createCellHandlerChain(genko) {
        return [
            new FullwidthSpaceVisible(genko),
            new Tatechuyoko2Digits(genko),
            new TatechuyokoOddDigit(genko),
            new RomanSentence(genko),
            new RomanSentenceOddFragment(genko),
            new HalfwidthSpaceVisible(genko),
            new EndBracket(genko),
            new EndOfLine(genko),
            new PassThrough(genko)
        ];
    }

    /**
     * @param {GenkoYoshi} genko 
     */
    constructor(genko) {
        /** @type {GenkoYoshi} */
        this.genko = genko;
    }

    options() {
        return this.genko.cellOptions;
    }

    /**
     * @returns {boolean}
     */
    isEnabled() {
        return true;
    }

    /**
     * 
     * @param {number} idx 
     * @param {CharExtractor} chars 
     * @param {GenkoYoshi} genko 
     * @returns {boolean}
     */
    matches(idx, chars, genko) {
        return true;
    }

    /**
     * 
     * @param {TextCell} cell 
     * @param {number} idx 
     * @param {CharExtractor} chars 
     * @param {GenkoYoshi} genko 
     * @returns {number}
     */
    apply(cell, idx, chars, genko) {
        return 1;
    }

    /**
     * 
     * @param {number} idx 
     * @param {GenkoYoshi} genko 
     * @returns {boolean}
     */
    isAtEndOfLine(idx, genko) {
        return idx % genko.colSize == genko.colSize - 1;
    }
}

class FullwidthSpaceVisible extends CellHandler {
    constructor(genko) {
        super(genko);
        this.regex = /\u3000/u;
    }

    isEnabled() {
        return true;
    }

    matches(idx, chars, genko) {
        return this.regex.test(chars.get(1));
    }

    apply($cell, idx, chars, genko) {
        $cell.addClass("fw-space").text("");
        return 1;
    }
}

class HalfwidthSpaceVisible extends CellHandler {
    constructor(genko) {
        super(genko);
        this.regex = /\u0020|\u00A0/u;
    }

    isEnabled() {
        return true;
    }

    matches(idx, chars, genko) {
        return this.regex.test(chars.get(1));
    }

    apply($cell, idx, chars, genko) {
        $cell.addClass("hw-space single").text("");
        return 1;
    }
}

class Tatechuyoko2Digits extends CellHandler {
    constructor(genko) {
        super(genko);
        this.regex1 = /\d{2}|[-,.'’]\d|\d[-,.]/u;
        this.regex2 = /^(?:['’]\d+|[-,.\d]+\d|\d[\d,.]+)$/u;
    }

    isEnabled() {
        return this.options().tatechuyoko;
    }

    matches(idx, chars, genko) {
        let prevCell = genko.$charCells[idx - 1];
        return this.regex1.test(chars.get(2)) && (!prevCell || !(prevCell.hasClass("ascii-combined") || prevCell.hasClass("odd-space")));
    }

    apply(cell, idx, chars, genko) {
        let len;
        if (this.regex2.test(chars.get(4))) {
            len = 4;
        } else if (this.regex2.test(chars.get(3))) {
            len = 3
        } else {
            len = 2;
        }
        cell.addClass("number-combined").text(chars.get(len));
        return len;
    }
}

class TatechuyokoOddDigit extends CellHandler {
    constructor(genko) {
        super(genko);
        this.regex = /\d[^\d]/u;
    }

    isEnabled() {
        return this.options().sidewaysRoman && this.options().tatechuyoko;
    }

    matches(idx, chars, genko) {
        return this.regex.test(chars.get(2));
    }

    apply(cell, idx, chars, genko) {
        cell.addClass("number-combined").text(chars.get(1));
        return 1;
    }
}

class RomanSentence extends CellHandler {

    constructor(genko) {
        super(genko);
        this.regexAscii = /^[\u0020-\u052f]+$/u;
        this.regexDigit = /\d{2}/u;
        this.regexHead = /(.+)\s/u;
        this.regexTail = /\s(.+)/u;
    }

    isEnabled() {
        return this.options().sidewaysRoman && this.options().combineRomanSentence;
    }

    matches(idx, chars, genko) {
        let $prev = genko.$charCells[idx - 1];
        if ($prev && $prev.hasClass("ascii-combined") || !this.options().tatechuyoko
                || this.options().tatechuyoko && !this.regexDigit.test(chars.get(3))) {
            return this.regexAscii.test(chars.get(2));
        }
    }

    apply(cell, idx, chars, genko) {
        cell.addClass("ascii-combined").addClass(genko.browser);
        // 欧文の行末禁則
        /*
        let chars = chars.get(2);

        if (this.isAtEndOfLine(idx, genko)) {
            let matchesAscii = chars.get(3).match(/[\u0020-\u052f]{2}([、。，．,.][)\]}>'"’”»›」』）｝】＞≫〕］〉》〙〛])/u);
            if (matchesAscii) {
                chars = chars.get(3);
            }
        }
        */
       let matchesHead = chars.get(2).match(this.regexHead);
        let matchesTail = chars.get(2).match(this.regexTail);
        if (matchesHead && matchesTail) {
            cell.addClass("hw-space before after").text("");
        } else if (matchesHead) {
            cell.addClass("hw-space after").text(matchesHead[1]);
        } else if (matchesTail) {
            cell.addClass("hw-space before").text(matchesTail[1]);
        } else {
            cell.text(chars.get(2));
        }
        return 2;
    }
}

class RomanSentenceOddFragment extends CellHandler {
    constructor(genko) {
        super(genko);
        this.regex1 = /^[\u0021-\u0099\u00a1-\u02af]+$/u;
        this.regex2 = /[^\u0021-\u0099\u00a1-\u052f]/u;
    }
    isEnabled() {
        return this.options().sidewaysRoman && this.options().combineRomanSentence;
    }

    matches(idx, chars, genko) {
        return idx > 1 && genko.$charCells[idx - 1]
                && genko.$charCells[idx - 1].hasClass("ascii-combined")
                && this.regex1.test(chars.get(1)) && this.regex2.test(chars.get(2));
    }

    apply(cell, idx, chars, genko) {
        cell.addClass("odd-space").text(chars.get(1));
        return 1;
    }
}

class EndBracket extends CellHandler {
    constructor(genko) {
        super(genko);
        this.regex = /[、。，．,.)\]}>'"’”»›」』）｝】＞≫〕］〉》〙〛]{2}/u;
    }

    isEnabled() {
        return this.options().combineEndBracket;
    }

    matches(idx, chars, genko) {
        return this.regex.test(chars.get(2));
    }

    apply(cell, idx, chars, genko) {
        cell.addClass("sign-combined").text(chars.get(2))
        return 2;
    }
}

class EndOfLine extends CellHandler {
    constructor(genko) {
        super(genko);
        this.regex1 = /(.|[\u0020-\u052f]{2})[、。，．,.)\]}>'"’”»›」』）｝】＞≫〕］〉》〙〛]/u;
        this.regex2 = /.([、。，．,.)\]}>'"’”»›」』）｝】＞≫〕］〉》〙〛]{2,})/u;
    }

    isEnabled() {
        return this.options().combineEndOfLine;
    }

    matches(idx, chars, genko) {
        return this.isAtEndOfLine(idx, genko) && this.regex1.test(chars.get(2));
    }

    apply(cell, idx, chars, genko) {
        cell.addClass("char-combined");

        let matches = chars.get(3).match(this.regex2);
        if (matches) {
            cell.text(chars.get(1));
            cell.append($("<span>").text(matches[1]));
            return 3;
        } else {
            cell.text(chars.get(2));
            return 2;
        }
    }
}

class PassThrough extends CellHandler {
    isEnabled() {
        return true;
    }

    matches(idx, chars, genko) {
        return true;
    }

    apply(cell, idx, chars, genko) {
        cell.text(chars.get(1));
        return 1;
    }
}
