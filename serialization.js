// Caterwaul serialization support | Spencer Tipping
// Licensed under the terms of the MIT source code license

// Introduction.
// This project is a reimplementation of Rather Insane Serialization (github.com/spencertipping/rather-insane-serialization) for Caterwaul. In addition to the functionality implemented in Rather
// Insane Serialization, this project also provides support for opaque references, which are associated with a specific serialization stream. This is useful for dealing with non-serializable
// values that are intermixed with normal ones. The most common use case for this is probably sending DOM nodes or jQuery collections to a server and then resolving them back into local objects
// when they reach the client again. This serialization library encodes the object's opaque identity whenever a reference is used; that way you have the property that for any reference X,
// deserialize(serialize(X)) === X. (This is true even if X changes state between serialization and deserialization.)

caterwaul('js_all')(function ($) {

// Serialization format.
// Serialized values are encoded into JSON data; the end result is something that you can invoke JSON.stringify() on to get a string. (You could also translate the data structure into XML or some
// other format prior to string conversion.) My initial inclination was to use a bytecode format similar to the one used by Rather Insane Serialization, but JSON is ultimately a more flexible
// solution and is easier to implement. It is probably also more performant in most cases.

// Like before, an object graph is used. The toplevel data structure is an array containing elements whose position determines their identity. The first eight logical elements are implied:

// | 0. undefined
//   1. null
//   2. value-type false
//   3. value-type true
//   4. value-type NaN
//   5. value-type -Infinity
//   6. value-type +Infinity
//   7. value-type 0

// Each entry within the toplevel array corresponds to a logical piece of data, and as such it has a type tag to indicate its role. The exceptions are for primitive numeric and string values,
// which are encoded verbatim. (The rationale is that they are supported by any marginally competent serialization layer such as JSON.) The type tags are:

// | 0. Unknown (used for opaque value encoding)
//   1. Reference boolean
//   2. Reference number
//   3. Reference string
//   4. Array
//   5. Object
//   6. Date
//   7. Regexp
//   8. Function (no closure support, unfortunately; but local referencing is used)

  $.serialization() = create_stream(),
  where [

// Object traversal logic.
// There are several steps to encoding a value. First, if the value is a primitive of some sort, it is encoded directly into the constant table. Multiple references to the same primitive are
// elided by reusing existing constant table entries; this is valid because primitives are extensional. Each reference has its 'value' stored, along with a table of its local key/value pairs.
// Each key and value is an index into the constant table. So, for example, here is how an object is encoded:

// | {hello: 'world'}   ->   ['hello', 'world', [5, 0, 1, 8, 9]]

// The last value in the toplevel array is the one that was serialized. The object's encoding arises because it is an object (5) with a stream-local ID (0), no particularly interesting value (1
// -> null), and one key/value pair ('hello' -> 'world'). 'hello' is at position 8 because of the preloaded constants, and 'world' is at position 9. Every reference type has the first three
// fields; further values are dependent on the key/value map of the object being encoded.

    key()                                         = n[22] *[String.fromCharCode(Math.random() * 94 + 33 >>> 0)] -seq -re- it.join(''),
    precoded_values                               = [void 0, null, false, true, ''/'', -1/0, 1/0, 0],
    structural_reference_types                    = [Boolean, Number, String, Array, Object, Date, RegExp, Function],

    encoder(locals, k, xs, c, encode = result)(v) = position_of(v) -or- wrap(v, store(v))
                                            -where [ref_detector         = key(),
                                                    is_precoded(v)       = !v || !isFinite(v) || v === true,
                                                    is_reference(v)      = (v[ref_detector] = ref) -re [v[ref_detector] === ref] -se- delete v[ref_detector] -where [ref = {}],

                                                    precoded_index_of(v) = precoded_values /~indexOf/ v,

                                                    // Note to self: the new Number() sketchiness is about making 0 truthy. If it's falsy, then position_of(v) might be false, causing
                                                    // 'undefined' to be stored in the real constant table (which will break all sorts of stuff).
                                                    position_of(v)        = v /!is_precoded ? new Number(precoded_index_of(v)) : v /!is_reference ? v[k] : c['@#{v}'],
                                                    store(v)              = v /!is_reference ? store_reference(locals.values[++locals.i] = v, locals.i) -se- visit(v)
                                                                                             : c['@#{v}'] = 7 + xs /~push/ v,

                                                    store_reference(v, i) = v[k] = 7 + xs /~push/ [type_of(v), i, encode(value_of(v))],

                                                    type_of(v)            = structural_reference_types /~indexOf/ v + 1,
                                                    value_of(v)           = v.constructor === Boolean || v.constructor === Number || v.constructor === Date ? v.valueOf() :
                                                                            v.constructor === String || v.constructor === RegExp || v.constructor === Function ? v.toString() : null,

                                                    visit(v)              = v /pairs *!encode_pair -seq -where [ref            = xs[position_of(v) - 8],
                                                                                                                encode_pair(p) = ref / encode(p[0]) /~push/ encode(p[1])]],

    decode(locals, xs) = values[values.length - 1] -where [was_local                    = {},
                                                           reconstitute(o, i)           = o.constructor === Array ? (was_local[i] = locals[o[1]]) || reconstitute_reference(o, i) : o,
                                                           reconstitute_reference(o, i) = 

                                                           values                       = precoded_values + xs *[reconstitute(x, xi)] -seq,



    ]})(caterwaul);

// Generated by SDoc 
