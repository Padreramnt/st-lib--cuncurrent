# Parallel execution of callbacks for each element of the iterable

``` tsx
import { runDependently, runIndependently, config } from '@st-lib/parallel'


function* getALotOfItems(count = 20e20) {
	for (let i =0; i < count; i++) {
		yield i
	}
}

// globally set the default number of threads
config.defaultThreads = 40

function doSomeHeavyCalculations(inp: number) {
	return new Promise<number>((res, rej) => {
		if (Math.random() < 0.0001) {
			setTimeout(rej, 100 + Math.random() * 4000, new Error(`something very bad happened to the ${inp}`))
		} else {
			setTimeout(res, 100 + Math.random() * 4000, inp * 2)
		}
	})
}

async function exampleRunDependently() {
	try {
		const results = await runDependently(getALotOfItems(), doSomeHeavyCalculations)
		console.log(results)
	} catch (error) {
		console.error(error)
		// catch the error
	}
}

async function exampleRunIndependently() {
	const { results, ok, errors, values } = await runIndependently(getALotOfItems(), doSomeHeavyCalculations)
	// variant 1: switch via `ok`
	if (ok) {
		// all ok, values contain returned values of each callback, similar to runDependently
		console.log(values)
	} else {
		// something failed, need process errors
		console.log(errors)
	}
	// variant 2: process each result separately
	for (const result of results) {
		if (result.ok) {
			console.log(result.data)
		} else {
			console.log(result.error)
		}
	}
	// variant 3: combine as u need
}
```
