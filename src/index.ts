import { isNumber } from "@st-lib/is"

export interface IOptions {
	/**
	 * number of processing callbacks in one time
	 * @default config.defaultThreads
	 */
	threads?: number
	/**
	 * stop further execution
	 */
	isCanceled?(): any
	/**
	 * called after callback completes
	 * @param readyCount count of processed items
	 */
	onProgress?(readyCount: number): void
}

export const config = {
	defaultThreads: 4
}

function getOptions(options: IOptions | null | undefined) {
	const threads = options && isNumber(options.threads) ? Math.max(options.threads, 2) : config.defaultThreads
	const isCanceled = options && typeof options.isCanceled === 'function' ? options.isCanceled : null
	const onProgress = options && typeof options.onProgress === 'function' ? options.onProgress : null
	return {
		threads,
		isCanceled,
		onProgress,
	} as const
}

function* toIterator<T>(it: Iterable<T>) {
	yield* it
}

export function runDependently<S extends Iterable<any>, R>(
	argsStream: S,
	cb: (it: S extends Iterable<infer T> ? T : never, index: number, self: S) => Promise<R>,
	options: IOptions | null = null,
) {
	return new Promise<R[]>((res, rej) => {
		const {
			threads,
			isCanceled,
			onProgress,
		} = getOptions(options)
		let throwed = false
		let readyCount = 0
		let currentIndex = 0
		const iter = toIterator(argsStream)
		const out = new Array(threads)
		const tasks: Promise<any>[] = []
		function reject(error: any) {
			throwed = true
			rej(error)
		}
		function dequeue(task: any) {
			const idx = tasks.indexOf(task)
			if (~idx) {
				tasks.splice(idx, 1)
			}
		}
		function queue(task: Promise<any>) {
			tasks.push(task)
			task.finally(dequeue.bind(null, task))
		}
		function put(value: any) {
			const index = currentIndex
			out.length = Math.max(out.length, index + 1)
			queue(cb(value, index, argsStream).then(result => {
				out[index] = result
			}).catch(reject).finally(() => {
				readyCount++
				if (onProgress) onProgress(readyCount)
			}))
			currentIndex++
		}
		for (let it = iter.next(); currentIndex < threads && !it.done; it = iter.next()) {
			put(it.value)
		}
		if (!throwed) Promise.race(tasks).then(async function next() {
			const it = iter.next()
			if ((isCanceled && isCanceled()) || it.done || throwed) {
				await Promise.all(tasks)
				res(out)
			} else {
				put(it.value)
				await Promise.race(tasks)
				next()
			}
		})
	})
}

export type Result<T> =
	| { ok: true, data: T }
	| { ok: false, error: any }

export interface Independent<T> {
	/**
	 * an array of the results of each callback
	 * @note list consistency is guaranteed
	 */
	results: Result<T>[]
	/**
	 * returned values of each callback
	 * @note list consistency is guaranteed
	 * @note it will have empty cells for failed callbacks
	 */
	values: T[]
	/**
	 * record of errors encountered during runtime, where key is the index of the failed callback
	 * @note list consistency is **NOT** guaranteed
	 */
	errors: Record<number, any>
	/**
	 * is all callbacks finished without errors
	 */
	ok: boolean
}

export function runIndependently<S extends Iterable<any>, R>(
	argsStream: S,
	cb: (it: S extends Iterable<infer T> ? T : never, index: number, self: S) => Promise<R>,
	options: IOptions | null = null,
) {
	return new Promise<Independent<R>>((res) => {
		const {
			threads,
			isCanceled,
			onProgress,
		} = getOptions(options)
		let readyCount = 0
		let currentIndex = 0
		const out: Independent<R> = {
			results: new Array(threads),
			values: new Array(threads),
			errors: {},
			ok: true,
		}
		const iter = toIterator(argsStream)
		const tasks: Promise<any>[] = []
		function dequeue(task: any) {
			const idx = tasks.indexOf(task)
			if (~idx) {
				tasks.splice(idx, 1)
			}
		}
		function queue(task: Promise<any>) {
			tasks.push(task)
			task.finally(dequeue.bind(null, task))
		}
		function put(value: any) {
			const index = currentIndex
			out.values.length = Math.max(out.values.length, index + 1)
			out.results.length = Math.max(out.results.length, index + 1)
			queue(cb(value, index, argsStream).then(data => {
				out.values[index] = data
				out.results[index] = {
					ok: true,
					data,
				}
			}).catch(error => {
				out.ok = false
				out.errors[index] = error
				out.results[index] = {
					ok: false,
					error,
				}
			}).finally(() => {
				readyCount++
				if (onProgress) onProgress(readyCount)
			}))
			currentIndex++
		}
		for (let it = iter.next(); currentIndex < threads && !it.done; it = iter.next()) {
			put(it.value)
		}
		Promise.race(tasks).then(async function next() {
			const it = iter.next()
			if ((isCanceled && isCanceled()) || it.done) {
				await Promise.all(tasks)
				res(out)
			} else {
				put(it.value)
				await Promise.race(tasks)
				next()
			}
		})
	})
}

export default {
	runIndependently,
	runDependently,
}