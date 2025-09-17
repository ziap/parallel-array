import { assert, assertEquals, assertNotEquals } from '@std/assert'

import ParallelArray, { type Item } from './parallel-array.ts'

// Define a standard layout for reuse in tests
const layout = {
	x: 'f32',
	y: 'f32',
	id: 'u32',
	health: 'i16',
} as const

type TestItem = Item<typeof layout>

Deno.test('ParallelArray.init - should initialize with correct internal state', () => {
	const pa = ParallelArray.init(layout)
	assertEquals(pa.len, 0, 'Initial length should be 0')

	// Whitebox testing: Access private properties using bracket syntax
	assertEquals(pa['size'], 0, 'Internal size should be 0')
	assertEquals(pa['cap'], 4, 'Default initial capacity should be 4')
	assertEquals(
		pa['keys'],
		['x', 'y', 'id', 'health'],
		'Internal keys should match layout',
	)
})

Deno.test('ParallelArray.withCapacity - should align capacity to the next power of 2', () => {
	const pa = ParallelArray.withCapacity(layout, 10)

	// Whitebox testing: 1 << (32 - Math.clz32(10 - 1)) => 1 << 4 => 16
	assertEquals(pa['cap'], 16, 'Internal capacity should be rounded up to 16')
	assertEquals(
		pa['data'][0].length,
		16,
		'Internal typed arrays should be allocated with aligned capacity',
	)

	// Minimum capacity is 4
	const pa1 = ParallelArray.withCapacity(layout, 3)
	assertEquals(pa1['cap'], 4, 'Internal capacity should be rounded up to 4')
	assertEquals(
		pa1['data'][0].length,
		4,
		'Internal typed arrays should be allocated with aligned capacity',
	)
})

Deno.test('ParallelArray.push - should reallocate and double capacity when full', () => {
	// Start with a capacity of 4, which is the default for .init()
	const pa = ParallelArray.withCapacity(layout, 4)
	assertEquals(pa['cap'], 4, 'Initial capacity should be 4')

	const oldDataRef = structuredClone(pa['data'])

	// Push 4 items to fill the initial capacity
	pa.push({ x: 1, y: 1, id: 1, health: 10 })
	pa.push({ x: 2, y: 2, id: 2, health: 20 })
	pa.push({ x: 3, y: 3, id: 3, health: 30 })
	pa.push({ x: 4, y: 4, id: 4, health: 40 })

	assertEquals(pa['size'], 4, 'Size should be 4')
	assertEquals(pa['cap'], 4, 'Capacity should still be 4')

	// This 5th push should trigger the reallocation
	pa.push({ x: 5, y: 5, id: 5, health: 50 })

	assertEquals(pa.len, 5, 'Length should be 5 after pushing 5 items')

	// Whitebox testing: verify reallocation occurred correctly
	assertEquals(pa['size'], 5, 'Internal size should now be 5')
	assertEquals(pa['cap'], 8, 'Capacity should have doubled to 8')

	const newData = pa['data']
	assertNotEquals(
		oldDataRef,
		newData,
		'Internal data array reference should have changed',
	)
	assertEquals(
		newData[0].length,
		8,
		'New typed arrays should have the new capacity',
	)
	assertEquals(
		newData[2][4],
		5,
		"Fifth item's data should be correct in the new buffer",
	)
})

Deno.test('ParallelArray.pop - should remove the last item and decrease size', () => {
	const pa = ParallelArray.init(layout)
	pa.push({ x: 1, y: 1, id: 1, health: 10 })
	pa.push({ x: 2, y: 2, id: 2, health: 20 })

	assertEquals(pa['size'], 2, 'Internal size should be 2 before pop')

	const popped = {}
	const result = pa.pop(popped)

	assert(result, 'Pop should be successful')
	assertEquals(popped, { x: 2, y: 2, id: 2, health: 20 })
	assertEquals(pa.len, 1, 'Length should be 1 after pop')
	assertEquals(pa['size'], 1, 'Internal size should be 1 after pop')

	assert(pa.pop(), 'Subsequent pops correctly returns the remaining value')
	assertEquals(pa.len, 0, 'Length should now be 0')
})

Deno.test('ParallelArray.pop - should gracefully handle an empty array', () => {
	const pa = ParallelArray.init(layout)
	assertEquals(pa.len, 0, 'Array should be empty initially')

	const out = {}
	const result = pa.pop(out)

	assert(!result, 'pop should return false on an empty array')
	assertEquals(pa.len, 0, 'Length should remain 0 after a failed pop')
	assertEquals(pa['size'], 0, 'Internal size should remain 0')
	assertEquals(
		out,
		{},
		"The 'out' object should not be modified on a failed pop",
	)

	assert(!pa.pop(), 'Subsequent pops should also return false')
	assertEquals(pa.len, 0, 'Length should still be 0')
})

Deno.test('ParallelArray.get - should return false for any out-of-bounds index', () => {
	const pa = ParallelArray.init(layout)
	pa.push({ x: 1, y: 1, id: 1, health: 10 })

	const out = {}

	// Test for a negative index
	assert(!pa.get(-1, out), 'get should return false for a negative index')

	// Test for an index equal to the array length
	assert(
		!pa.get(1, out),
		'get should return false for an index equal to the length',
	)

	// Test for an index far greater than the array length
	assert(
		!pa.get(99, out),
		'get should return false for a large, out-of-bounds index',
	)

	// Verify the 'out' object was never modified during the failed calls
	assertEquals(out, {}, 'out object should not be modified on any failure')
})

Deno.test('ParallelArray.get - should retrieve the item at a specific index', () => {
	const pa = ParallelArray.init(layout)
	const item1: TestItem = { x: 1, y: 1, id: 1, health: 10 }
	const item2: TestItem = { x: 2, y: 2, id: 2, health: 20 }
	const item3: TestItem = { x: 3, y: 3, id: 3, health: 30 }
	pa.push(item1)
	pa.push(item2)
	pa.push(item3)

	const out = {}
	const result = pa.get(1, out) // Get the middle item

	assert(result, 'get should return true for a valid index')
	assertEquals(
		out,
		item2,
		'Retrieved item should match the item at the specified index',
	)
})

Deno.test('ParallelArray.set - should update the value in the internal data array', () => {
	const pa = ParallelArray.init(layout)
	pa.push({ x: 1, y: 1, id: 1, health: 10 })

	const newItem: TestItem = { x: 99, y: 99, id: 99, health: -50 }
	pa.set(0, newItem)

	// Whitebox testing: check the underlying buffers directly
	const data = pa['data']
	assertEquals(data[0][0], 99, 'Internal x value should be updated')
	assertEquals(data[3][0], -50, 'Internal health value should be updated')
})

Deno.test('ParallelArray.view - should provide a correct view of the data', () => {
	const pa = ParallelArray.init(layout)
	pa.push({ x: 1.5, y: -1.5, id: 1, health: 10 })
	pa.push({ x: 2.5, y: -2.5, id: 2, health: 20 })

	const view = pa.view()

	// Check types
	assert(view.x instanceof Float32Array, 'x should be Float32Array')
	assert(view.id instanceof Uint32Array, 'id should be Uint32Array')

	// Use Array.from to compare the contents of the typed arrays
	assertEquals(Array.from(view.x), [1.5, 2.5])
	assertEquals(Array.from(view.y), [-1.5, -2.5])
	assertEquals(Array.from(view.id), [1, 2])
	assertEquals(Array.from(view.health), [10, 20])
})

Deno.test('ParallelArray.copy - should create a deep copy of the data buffers', () => {
	const pa1 = ParallelArray.init(layout)
	pa1.push({ x: 1, y: 1, id: 1, health: 10 })

	const pa2 = pa1.copy()

	// Use Array.from to verify the contents are identical
	assertEquals(
		Array.from(pa1['data']),
		Array.from(pa2['data']),
		"The content of the copied 'x' buffer should be identical",
	)
})

Deno.test('ParallelArray.copy - modifications to original should not affect the copy', () => {
	const pa1 = ParallelArray.init(layout)
	pa1.push({ x: 1, y: 1, id: 1, health: 10 })

	const pa2 = pa1.copy()

	// Modify the original
	pa1.push({ x: 2, y: 2, id: 2, health: 20 })
	pa1.set(0, { x: 99, y: 99, id: 99, health: 99 })

	const view1 = pa1.view()
	const view2 = pa2.view()

	// Verify original was changed
	assertEquals(pa1.len, 2)
	assertEquals(Array.from(view1.id), [99, 2])

	// Verify copy is unchanged using Array.from
	assertEquals(pa2.len, 1)
	assertEquals(
		Array.from(view2.x),
		[1],
		"Copy's 'x' data should not be modified",
	)
	assertEquals(
		Array.from(view2.id),
		[1],
		"Copy's 'id' data should not be modified",
	)
})
