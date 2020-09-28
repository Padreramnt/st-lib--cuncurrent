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
	const isCanceled = typeof options?.isCanceled === 'function' ? options.isCanceled : null
	const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null
	return {
		threads,
		isCanceled,
		onProgress,
	} as const
}

export type Callback<T, R> = (it: T, index: number, self: readonly T[]) => Promise<R>

export function runDependently<T, R>(
	array: readonly T[],
	cb: Callback<T, R>,
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
		const out = new Array(array.length)
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
		function put() {
			const index = currentIndex
			queue(cb(array[index], index, array).then(result => {
				out[index] = result
			}).catch(reject).finally(() => {
				readyCount++
				if (onProgress) onProgress(readyCount)
			}))
			currentIndex++
		}
		while (currentIndex < threads && currentIndex < array.length) {
			put()
		}
		if (!throwed) Promise.race(tasks).then(async function next() {
			if ((isCanceled && isCanceled()) || array.length <= currentIndex || throwed) {
				await Promise.all(tasks)
				res(out)
			} else {
				put()
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

export function runIndependently<T, R>(
	array: readonly T[],
	cb: Callback<T, R>,
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
			results: new Array(array.length),
			values: new Array(array.length),
			errors: {},
			ok: true,
		}
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
		function put() {
			const index = currentIndex
			queue(cb(array[index], index, array).then(data => {
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
		while (currentIndex < threads && currentIndex < array.length) {
			put()
		}
		Promise.race(tasks).then(async function next() {
			if ((isCanceled && isCanceled()) || array.length <= currentIndex) {
				await Promise.all(tasks)
				res(out)
			} else {
				put()
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