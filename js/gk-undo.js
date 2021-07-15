import { GenkoYoshi } from "./genkoyoshi.js";

 export class UndoManager {
    constructor(genko) {
        /** @type {GenkoYoshi} */
        this.genko = genko;

        this.undoStack = [];
        this.redoStack = [];
        this.step = null;
    }

    beginStep() {
        this.step = [];
    }

    record(cmd) {
        this.step.push(cmd);
    }

    commitStep() {
        this.undoStack.push(this.step);
        this.redoStack = [];
        this.step = null;
    }

    dropStep() {
        this.step = null;
    }

    undo() {
        this.revert(this.undoStack, this.redoStack);
    }

    redo() {
        this.revert(this.redoStack, this.undoStack);
    }

    revert(stack1, stack2) {
        let step = stack1.pop();
        if (step == null) return;

        var stepNext = step.map(cmd => cmd.revert(this.genko));
        stack2.push(stepNext);
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }
}

export class CommandInsert {
    constructor(pos, text) {
        this.pos = pos;
        this.text = text;
    }

    /**
     * @param {GenkoYoshi} genko 
     * @returns {CommandDelete}
     */
    revert(genko) {
        // Undoing insertion is to DELETE
        var textContainer = genko.text;
        var currText = textContainer.text;
        var before = currText.slice(0, this.pos);
        var after = currText.slice(this.pos + this.text.length, currText.length);
        textContainer.text = before.concat(after);
        genko.updateText(this.pos);
        genko.onCaretMoved(this.pos);

        return new CommandDelete(this.pos, this.text);
    }
}

export class CommandDelete {
    constructor(pos, text) {
        this.pos = pos;
        this.text = text;
    }

    /**
     * @param {GenkoYoshi} genko 
     * @returns {CommandInsert}
     */
    revert(genko) {
        // Undoing deletion is to INSERT
        var textContainer = genko.text;
        var currText = textContainer.text;
        var before = currText.slice(0, this.pos);
        var after = currText.slice(this.pos, currText.length);
        textContainer.text = before.clone().concat(this.text).concat(after);

        var nextPos = before.length + this.text.length;
        genko.updateText(this.pos);
        genko.onCaretMoved(nextPos);

        return new CommandInsert(this.pos, this.text);
    }
}
