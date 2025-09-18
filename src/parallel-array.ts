const arrayTypes = {
	'i8': Int8Array,
	'u8': Uint8Array,
	'i16': Int16Array,
	'u16': Uint16Array,
	'i32': Int32Array,
	'u32': Uint32Array,
	'f32': Float32Array,
	'f64': Float64Array,
} as const

type Constructors = (typeof arrayTypes)[keyof typeof arrayTypes]
type ArrayTypes = InstanceType<Constructors>
type Constraint = Record<string, keyof typeof arrayTypes>

/**
 * Represents a single item within a {@link ParallelArray}.
 * The keys are defined by the layout provided to the `ParallelArray`,
 * and all values are numbers.
 */
export type Item<T extends Constraint> = Record<keyof T, number>

/**
 * A view into the data of a {@link ParallelArray}.
 * This provides direct access to the underlying typed arrays.
 */
type View<T extends Constraint> = {
	[K in keyof T]: InstanceType<(typeof arrayTypes)[T[K]]>
}

function allocateArrays(
	constructors: ArrayLike<Constructors>,
	capacity: number,
): ArrayTypes[] {
	let size = 0
	for (let i = 0; i < constructors.length; ++i) {
		const elemSize = constructors[i].BYTES_PER_ELEMENT
		size = (size + elemSize - 1) & -elemSize
		size += capacity * elemSize
	}

	const buffer = new ArrayBuffer(size)
	const result = new Array<ArrayTypes>(constructors.length)
	let offset = 0
	for (let i = 0; i < constructors.length; ++i) {
		const elemSize = constructors[i].BYTES_PER_ELEMENT
		offset = (offset + elemSize - 1) & -elemSize
		result[i] = new constructors[i](buffer, offset, capacity)
		offset += capacity * elemSize
	}

	return result
}

function reallocate(
	old: ArrayLike<ArrayTypes>,
	constructors: ArrayLike<Constructors>,
	capacity: number,
): ArrayTypes[] {
	const data = allocateArrays(constructors, capacity)
	for (let i = 0; i < data.length; ++i) {
		data[i].set(old[i])
	}
	return data
}

function alignCapacity(capacity: number): number {
	return 1 << (32 - Math.clz32(capacity - 1))
}

/**
 * A data structure that stores data in a "struct of arrays" format.
 * This can be more memory-efficient and performant for certain operations
 * compared to an array of objects ("array of structs").
 *
 * @template T - A constraint object that defines the layout of the parallel array.
 * The keys of the object are the names of the fields, and the values are the
 * corresponding typed array identifiers (e.g., 'i32', 'f64').
 */
export default class ParallelArray<T extends Constraint> {
	private constructor(
		private readonly constructors: Constructors[],
		private readonly keys: (keyof T)[],
		private data: readonly ArrayTypes[],
		private items: Record<keyof T, ArrayTypes>,
		private size: number,
		private capacity: number,
		private updated: boolean,
	) {}

	/**
	 * @returns The number of items currently in the parallel array.
	 */
	get len(): number {
		return this.size
	}

	/**
	 * Resizes the array to contain a specific number of items.
	 *
	 * @note Any new elements added by this expansion (from the old size up to `newSize`)
	 * will contain zero values and should be manually initialized.
	 *
	 * @param newSize - The desired number of items for the array.
	 */
	resize(newSize: number): void {
		this.size = newSize
		this.updated = true

		if (newSize > this.capacity) {
			this.capacity = alignCapacity(newSize)
			this.data = reallocate(this.data, this.constructors, this.capacity)
		}
	}

	/**
	 * Returns a view of the underlying typed arrays.
	 * This is the most efficient way to access the data.
	 *
	 * @returns An object where keys correspond to the layout and values are the
	 * underlying typed arrays.
	 */
	view(): Readonly<View<T>> {
		if (this.updated) {
			for (let i = 0; i < this.keys.length; ++i) {
				this.items[this.keys[i]] = this.data[i].subarray(0, this.size)
			}
			this.updated = false
		}
		return this.items as View<T>
	}

	/**
	 * Initializes a new `ParallelArray` with a default capacity.
	 *
	 * @template T1 - The layout constraint.
	 * @param layout - An object defining the structure of the parallel array.
	 * @returns A new `ParallelArray` instance.
	 */
	static init<T1 extends Constraint>(layout: T1): ParallelArray<T1> {
		return ParallelArray.withCapacity<T1>(layout, 4)
	}

	/**
	 * Initializes a new `ParallelArray` with a specified capacity.
	 *
	 * @note If the total number of elements is known beforehand, using this
	 * method to pre-allocate memory can speed up a series of `push` operations
	 * by avoiding intermediate reallocations.
	 *
	 * @template T1 - The layout constraint.
	 * @param layout - An object defining the structure of the parallel array.
	 * @param capacity - The initial capacity of the array.
	 * @returns A new `ParallelArray` instance.
	 */
	static withCapacity<T1 extends Constraint>(
		layout: T1,
		capacity: number,
	): ParallelArray<T1> {
		const aligned = alignCapacity(Math.max(capacity, 4))
		const keys = Object.keys(layout)
		const constructors = keys.map((k: keyof T1) => arrayTypes[layout[k]])

		return new ParallelArray<T1>(
			constructors,
			keys,
			allocateArrays(constructors, aligned),
			{} as Record<keyof T1, ArrayTypes>,
			0,
			aligned,
			true,
		)
	}

	/**
	 * Creates a copy of the `ParallelArray`.
	 *
	 * @returns A new `ParallelArray` instance with the same data.
	 */
	copy(): ParallelArray<T> {
		const data = allocateArrays(this.constructors, this.capacity)
		for (let i = 0; i < this.keys.length; ++i) {
			data[i].set(this.data[i])
		}

		return new ParallelArray<T>(
			this.constructors,
			this.keys,
			data,
			{} as Record<keyof T, ArrayTypes>,
			this.size,
			this.capacity,
			true,
		)
	}

	/**
	 * Adds an item to the end of the `ParallelArray`.
	 *
	 * @param item - The item to add.
	 */
	push(item: Item<T>): void {
		if (this.size === this.capacity) {
			this.capacity <<= 1
			this.data = reallocate(this.data, this.constructors, this.capacity)
		}

		this.set(this.size, item)
		this.size += 1
		this.updated = true
	}

	/**
	 * Removes the last item from the `ParallelArray` and returns it.
	 *
	 * @param out - An optional object to store the popped item in.
	 * @returns `true` if an item was popped, `false` if the array was empty.
	 */
	pop(out?: Item<T> | Record<string, never>): out is Item<T> {
		if (this.size === 0) return false

		this.size -= 1
		this.updated = true

		if (out === undefined) return true

		const result = out as Item<T>
		for (let i = 0; i < this.keys.length; ++i) {
			result[this.keys[i]] = this.data[i][this.size]
		}

		return true
	}

	/**
	 * Retrieves an item at a specific index.
	 *
	 * @note This method is extremely slow. For frequent access, use `.view()` instead.
	 * If you find yourself using this method often, consider switching to a
	 * regular array of objects (`Item<layout>[]`) unless memory usage is a concern.
	 *
	 * @param idx - The index of the item to retrieve.
	 * @param out - An object to store the retrieved item in.
	 * @returns `true` if the item was retrieved successfully, `false` if the index was out of bounds.
	 */
	get(
		idx: number,
		out: Item<T> | Record<string, never>,
	): out is Item<T> {
		if (idx < 0 || idx >= this.size) return false
		const result = out as Item<T>

		for (let i = 0; i < this.keys.length; ++i) {
			result[this.keys[i]] = this.data[i][idx]
		}

		return true
	}

	/**
	 * Updates an item at a specific index.
	 *
	 * @note This method is extremely slow. For frequent modifications, use `.view()` instead.
	 * If you find yourself using this method often, consider switching to a
	 * regular array of objects (`Item<layout>[]`) unless memory usage is a concern.
	 *
	 * @param idx - The index of the item to set.
	 * @param item - The new value for the item.
	 */
	set(idx: number, item: Readonly<Item<T>>): void {
		for (let i = 0; i < this.keys.length; ++i) {
			this.data[i][idx] = item[this.keys[i]]
		}
	}
}
