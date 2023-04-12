// 状态常量
const PENDING = 'pending';
const FULFILLED = 'fulfilled';
const REJECTED = 'rejected';

class MyPromise {
    /**
     * 创建Promise
     * @param {Function} executor 执行器函数，用于初始化Promise
     */
    constructor(executor) {
        // 状态
        this._state = PENDING;
        // 结果
        this._result = undefined;
        // 状态决定之后的函数执行队列
        this._handlerQueue = [];

        try {
            executor(this._resolve.bind(this), this._reject.bind(this));
        } catch(error) {
            this._reject(error);
        }
    }

    /**
     * then方法
     * @param {Function} onfulfilled 成功之后的回调函数
     * @param {Function} onrejected 失败之后的回调函数
     * @returns 新的MyPromise实例
     */
    then(onfulfilled, onrejected) {
        return new MyPromise((resolve, reject) => {
            this._pushHandler(onfulfilled, FULFILLED, resolve, reject);
            this._pushHandler(onrejected, REJECTED, resolve, reject);
            this._executeHandlers();
        });
    }

    /**
     * catch方法
     * @param {Function} onrejected 失败之后的回调函数
     * @returns 新的MyPromise实例
     */
    catch(onrejected) {
        return this.then(undefined, onrejected);
    }

    /**
     * finally方法
     * @param {Function} onfinally 成功或失败之后的回调函数
     * @returns 新的MyPromise实例
     */
    finally(onfinally) {
        return this.then(value => {
            typeof onfinally === 'function' && onfinally();
            return value;
        }, reason => {
            typeof onfinally === 'function' && onfinally();
            throw reason;
        });
    }

    /**
     * 切换状态
     * @param {String} state 状态
     * @param {any} result 结果
     */
    _changeState(state, result) {
        // 状态不重复改变
        if (this._state !== PENDING) {
            return;
        }
        this._state = state;
        this._result = result;
        this._executeHandlers();
    }

    /**
     * 标志任务成功
     * @param {any} value 成功的数据
     */
    _resolve(value) {
        this._changeState(FULFILLED, value);
    }

    /**
     * 标志任务失败
     * @param {any} reason 失败的原因
     */
    _reject(reason) {
        this._changeState(REJECTED, reason);
    }

    /**
     * 向执行队列中添加函数
     * @param {Function} executor 需要执行的回调函数
     * @param {String} state 标记执行回调函数的状态
     * @param {Function} resolve 标志then方法返回的MyPromise成功
     * @param {Function} reject 标志then方法返回的MyPromise失败
     */
    _pushHandler(executor, state, resolve, reject) {
        this._handlerQueue.push({ executor, state, resolve, reject });
    }

    /**
     * 循环执行队列中的函数
     */
    _executeHandlers() {
        if (this._state === PENDING) {
            return;
        }
        while (this._handlerQueue.length) {
            this._executeCurrentHandler(this._handlerQueue[0]);
            this._handlerQueue.shift();
        }
    }
    /**
     * 执行队列中的函数
     * @param {Object} handler 队列中的任务对象
     */
    _executeCurrentHandler(handler) {
        const { executor, state, resolve, reject } = handler;
        executeMicroQueueTask(() => {
            // 不是相应状态，不处理
            if (state !== this._state) {
                return;
            }
            // then方法中未传入函数，当前的状态和结果直接向后传递
            if (typeof executor !== 'function') {
                this._state === FULFILLED ? resolve(this._result) : reject(this._result);
                return;
            }
            try {
                const result = executor(this._result);
                if (isPromise(result)) {
                    result.then(resolve, reject);
                } else {
                    resolve(result);
                }
            } catch(error) {
                reject(error);
            }
        });
    }

    /**
     * 构造函数的resolve方法
     * @param {any} value 成功的数据
     * @returns MyPromise实例
     */
    static resolve(value) {
        return new MyPromise((resolve, reject) => {
            if (isPromise(value)) {
                value.then(resolve, reject);
            } else {
                resolve(value);
            }
        });
    }

    /**
     * 构造函数的reject方法
     * @param {any} reason 失败的原因
     * @returns MyPromise实例
     */
    static reject(reason) {
        return new MyPromise((_resolve, reject) => {
            reject(reason);
        });
    }

    /**
     * 构造函数的all方法
     * @param {Array} promiseQueue （类似）Promise实例数组
     * @returns MyPromise实例
     */
    static all(promiseQueue) {
        const { length } = promiseQueue;
        // 成功的数量
        let fulfilledLength = 0;
        // 成功的数据数组
        const values = [];
        return new MyPromise((resolve, reject) => {
            if (length === 0) {
                resolve();
                return;
            }
            promiseQueue.forEach((item, index) => {
                MyPromise.resolve(item).then(value => {
                    fulfilledLength++;
                    values[index] = value;
                    // 全部成功时，返回的MyPromise实例变为成功状态
                    if (fulfilledLength === length) {
                        resolve(values);
                    }
                }, reason => {
                    // 遇到失败的MyPromise，返回的MyPromise实例变为失败状态
                    reject(reason);
                });
            });
        });
    }

    /**
     * 构造函数的allSettled方法
     * @param {Array} promiseQueue （类似）Promise实例数组
     * @returns MyPromise实例
     */
    static allSettled(promiseQueue) {
        const newQueue = promiseQueue.map(item => {
            return MyPromise.resolve(item).then(value => {
                return { status: FULFILLED, value };
            }, reason => {
                return { status: REJECTED, reason };
            });
        });
        return MyPromise.all(newQueue);
    }

    /**
     * 构造函数的race方法
     * @param {Array} promiseQueue （类似）Promise实例数组
     * @returns MyPromise实例
     */
    static race(promiseQueue) {
        return new MyPromise((resolve, reject) => {
            promiseQueue.forEach(item => {
                MyPromise.resolve(item).then(resolve, reject);
            });
        });
    }
}

/**
 * 判断一个对象是否为（类似）Promise实例
 * @param {Object} object 
 * @returns isPromise
 */
function isPromise(object) {
    return Boolean(object) && typeof object === 'object' && typeof object.then === 'function';
}

/**
 * 执行微队列任务
 * @param {Function} callback 需要置于微队列中执行的函数
 */
function executeMicroQueueTask(callback) {
    if (typeof process !== 'undefined' && process.nextTick) {
        process.nextTick(callback);
    } else if (typeof MutationObserver !== 'undefined') {
        const div = document.createElement('div');
        const observer = new MutationObserver(callback);
        observer.observe(div, { childList: true });
        div.innerHTML = ' ';
    } else {
        setTimeout(callback);
    }
}
