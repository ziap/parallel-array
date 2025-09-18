// benchmark.ts
import ParallelArray from './parallel-array.ts'
import type { Item } from './parallel-array.ts'

const NUM_ITEMS = 1_000_000
const particleLayout = {
	id: 'u32',
	x: 'f32',
	y: 'f32',
	vx: 'f32',
	vy: 'f32',
} as const

type Particle = Item<typeof particleLayout>

// --- Global Read-Only Data for Read Benchmarks ---
// We set this up once outside the benchmarks to ensure we are only measuring
// read performance, not data creation time.
console.log(`Setting up shared read-only data for ${NUM_ITEMS} items...`)

// ParallelArray (ParallelArray) setup
const pArray: ParallelArray<typeof particleLayout> = ParallelArray.withCapacity(
	particleLayout,
	NUM_ITEMS,
)

// Array of Objects (Array of Objects) setup
// We use an IIFE to populate both arrays with the exact same random data.
const aArray: readonly Particle[] = (() => {
	const arr: Particle[] = []
	for (let i = 0; i < NUM_ITEMS; i++) {
		const particle = {
			id: i,
			x: Math.random() * 100,
			y: Math.random() * 100,
			vx: Math.random() * 10,
			vy: Math.random() * 10,
		}
		arr.push(particle)
		pArray.push(particle) // Populate pArray at the same time
	}
	return arr
})()

// Pre-generate a list of random indices to ensure the random access pattern is
// identical for both data structures and to avoid measuring Math.random() time.
const randomIndices = new Uint32Array(NUM_ITEMS)
for (let i = 0; i < NUM_ITEMS; i++) {
	randomIndices[i] = Math.floor(Math.random() * NUM_ITEMS)
}

console.log('Data setup complete. Running benchmarks...\n')

// === WRITE BENCHMARKS ===
// These tests create and populate the arrays within the benchmark function.

Deno.bench({
	name: 'Write: Array of Objects',
	group: 'Write Performance',
	fn: () => {
		const arr: Particle[] = []
		for (let i = 0; i < NUM_ITEMS; i++) {
			arr.push({
				id: i,
				x: Math.random() * 100,
				y: Math.random() * 100,
				vx: Math.random() * 10,
				vy: Math.random() * 10,
			})
		}
	},
})

Deno.bench({
	name: 'Write: Array of Objects - Resize + Assign',
	group: 'Write Performance',
	fn: () => {
		const arr = new Array<Particle>(NUM_ITEMS)
		for (let i = 0; i < NUM_ITEMS; i++) {
			arr[i] = {
				id: i,
				x: Math.random() * 100,
				y: Math.random() * 100,
				vx: Math.random() * 10,
				vy: Math.random() * 10,
			}
		}
	},
})

Deno.bench({
	name: 'Write: ParallelArray',
	group: 'Write Performance',
	fn: () => {
		const arr = ParallelArray.init(particleLayout)
		for (let i = 0; i < NUM_ITEMS; i++) {
			arr.push({
				id: i,
				x: Math.random() * 100,
				y: Math.random() * 100,
				vx: Math.random() * 10,
				vy: Math.random() * 10,
			})
		}
	},
})

Deno.bench({
	name: 'Write: ParallelArray - Preallocate',
	group: 'Write Performance',
	fn: () => {
		const arr = ParallelArray.withCapacity(particleLayout, NUM_ITEMS)
		for (let i = 0; i < NUM_ITEMS; i++) {
			arr.push({
				id: i,
				x: Math.random() * 100,
				y: Math.random() * 100,
				vx: Math.random() * 10,
				vy: Math.random() * 10,
			})
		}
	},
})

Deno.bench({
	name: 'Write: ParallelArray - Resize + Assign',
	group: 'Write Performance',
	fn: () => {
		const arr = ParallelArray.withCapacity(particleLayout, NUM_ITEMS)
		arr.resize(NUM_ITEMS)

		const { id, x, y, vx, vy } = arr.view()

		for (let i = 0; i < NUM_ITEMS; i++) {
			id[i] = i
			x[i] = Math.random() * 100
			y[i] = Math.random() * 100
			vx[i] = Math.random() * 10
			vy[i] = Math.random() * 10
		}
	},
})

// === SEQUENTIAL READ BENCHMARKS ===
// These tests read from the pre-populated global arrays.

Deno.bench({
	name: 'Wide Sequential Read: Array of Objects',
	group: 'Sequential Read',
	fn: () => {
		let sum = 0
		for (let i = 0; i < aArray.length; i++) {
			const item = aArray[i]
			sum += item.x + item.y
		}
	},
})

Deno.bench({
	name: 'Wide Sequential Read: ParallelArray',
	group: 'Sequential Read',
	fn: () => {
		let sum = 0
		const out = {}
		for (let i = 0; i < pArray.len; i++) {
			if (pArray.get(i, out)) {
				const { x, y } = out
				sum += x + y
			}
		}
	},
})

Deno.bench({
	name: 'Narrow Sequential Read: Array of Objects',
	group: 'Sequential Read',
	fn: () => {
		let sum = 0
		for (let i = 0; i < aArray.length; i++) {
			sum += aArray[i].x
		}
	},
})

Deno.bench({
	name: 'Narrow Sequential Read: ParallelArray',
	group: 'Sequential Read',
	fn: () => {
		let sum = 0
		const { x } = pArray.view()
		for (let i = 0; i < pArray.len; i++) {
			sum += x[i]
		}
	},
})

// === RANDOM ACCESS READ BENCHMARKS ===
// These tests read from the pre-populated global arrays using random indices.

Deno.bench({
	name: 'Wide Random Read: Array of Objects',
	group: 'Random Read',
	fn: () => {
		let sum = 0
		for (const idx of randomIndices) {
			const item = aArray[idx]
			sum += item.x + item.y
		}
	},
})

Deno.bench({
	name: 'Wide Random Read: ParallelArray',
	group: 'Random Read',
	fn: () => {
		let sum = 0
		const out = {}
		for (const idx of randomIndices) {
			if (pArray.get(idx, out)) {
				const { x, y } = out
				sum += x + y
			}
		}
	},
})

Deno.bench({
	name: 'Narrow Random Read: Array of Objects',
	group: 'Random Read',
	fn: () => {
		let sum = 0
		for (const idx of randomIndices) {
			sum += aArray[idx].x
		}
	},
})

Deno.bench({
	name: 'Narrow Random Read: ParallelArray',
	group: 'Random Read',
	fn: () => {
		let sum = 0
		const { x } = pArray.view()
		for (const idx of randomIndices) {
			sum += x[idx]
		}
	},
})
