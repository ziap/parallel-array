# ParallelArray - SoA in TypeScript

Store and process numeric, structured data efficiently with typed-arrays and SoA layout in TypeScript. Read more about the design and motivation of this data structure here: (TBA)

## Motivation

In typical JavaScript applications, we often represent a collection of items as an array of objects, or "array of structs" (AoS) layout:

```ts
const arrayOfStructs = [
	{ x: 1, y: 2, z: 3 },
	{ x: 4, y: 5, z: 6 },
	/* ... */
]
```

While this approach is intuitive, it can lead to performance bottlenecks. When you iterate over this data to perform an operation on a single field (example below), the CPU has to jump around in memory, leading to poor cache utilization.

```ts
function countUnderground(data) {
	let count = 0
	for (let i = 0; i < data.length; ++i) {
		if (data[i].y < 0) {
			count += 1
		}
	}
	return count
}
```

A "struct of arrays" (SoA) layout organizes data by property, storing each property in a separate, contiguous array.

```ts
const structOfArrays = {
	x: new Float32Array([1, 4 /* ... */]),
	y: new Float32Array([2, 5 /* ... */]),
	z: new Float32Array([3, 6 /* ... */]),
}
```

This structure offers significant advantages:

- **Improved Cache Performance:** When you iterate over a single property (e.g., the `x` array), the data is laid out contiguously in memory. This allows the CPU to make better use of its cache, leading to faster processing.
- **Memory Efficiency:** By using JavaScript's `TypedArray`s, we can store numerical data in a compact, binary format, reducing overall memory consumption.
- **Faster and Simpler Binary Serialization:** The SoA layout makes it trivial to serialize the data into a binary format that is significantly faster and requires less code than serializing an array of objects. This is especially useful for saving state, sending data over a network, or passing data to Web Workers.

`ParallelArray` provides a convenient, type-safe interface for working with data in the SoA format, handling memory allocation and providing efficient access methods.

## Usage

### Defining a layout

First, define the structure of your data by creating a `layout` object. The keys represent the property names, and the values are strings corresponding to `TypedArray` types.

```ts
const layout = {
	x: 'f32',
	y: 'f32',
	vx: 'f32',
	vy: 'f32',
	id: 'u32',
} as const
```

### Initialization

You can initialize a `ParallelArray` with a default capacity or a specified capacity. Pre-allocating memory with `withCapacity` is more efficient if you know the approximate number of items you'll be storing.

```ts
// Initialize with a default capacity
const particles = ParallelArray.init(layout)

// Initialize with a specific capacity
const bullets = ParallelArray.withCapacity(layout, 1024)
```

### Adding and Removing Items

Use `push` to add new items and `pop` to remove the last item.

```ts
particles.push({ x: 10, y: 20, vx: 1, vy: 0, id: 1 })
particles.push({ x: 30, y: 40, vx: -1, vy: 0, id: 2 })

console.log(particles.len) // 2

const poppedItem = {} // NOTE: for better performance, reuse this object
if (particles.pop(poppedItem)) {
	console.log(poppedItem) // { x: 30, y: 40, vx: -1, vy: 0, id: 2 }
}

console.log(particles.len) // 1
```

### Efficient Data Access with `view()`

The most performant way to access and manipulate the data in a `ParallelArray` is through the `view()` method. This method returns an object containing the underlying `TypedArray`s, allowing for direct and fast operations.

This is ideal for game loops or any performance-critical code where you are iterating over all items.

```ts
// In a game loop
function update(dt: number) {
	const { x, y, vx, vy } = particles.view()

	for (let i = 0; i < particles.len; i++) {
		x[i] += vx[i] * dt
		y[i] += vy[i] * dt
	}
}
```

### Individual Item Access (Slow)

While `ParallelArray` is optimized for bulk operations, it also provides `get()` and `set()` methods for accessing individual items.

**Note:** These methods are significantly slower than using `view()` because they require constructing an object for each access. You should only use them for infrequent, random access. If your use case involves frequent random access to individual items, a traditional array of objects might be more suitable.

```ts
// Retrieving an item (slow)
const item = {}
if (particles.get(0, item)) {
	console.log(item) // { x: 10, y: 20, vx: 1, vy: 0, id: 1 }
}

// Updating an item (moderate)
particles.set(0, { x: 15, y: 25, vx: 1, vy: 0, id: 1 })
```

## Limitations

- **Slow Random Access:** Accessing or modifying individual items using `get()` and `set()` is inefficient. The primary performance benefit of this library comes from bulk operations on the data exposed by `view()`. If you need frequent random access, consider whether the SoA pattern is the right fit for your specific problem.
- **Fixed Layout:** The layout of the `ParallelArray` is fixed upon initialization and cannot be changed. This is an intentional design choice that guarantees type safety and predictable memory layout, which are crucial for high-performance applications. It prevents runtime errors and allows JavaScript engines to better optimize the code.
- **Numerical Data Only:** This implementation is built on `TypedArray`s and is therefore limited to numerical data. However, more complex data structures can be accommodated through various techniques. For example, strings can be handled via **string interning**, where the `ParallelArray` stores an integer index pointing to a string in a separate lookup table. Nested structures like `{ position: { x: 10 } }` can be flattened into `{ position_x: 'f32' }`. Relational data like graphs or trees can be converted to a tabular format and numeric internal reference.

## Benchmark

TBA
