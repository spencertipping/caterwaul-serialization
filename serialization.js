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
//   8. value-type '' (empty string)

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

  $.serialization = stream /-$.merge/ statics -where [

// Object traversal logic.
// There are several steps to encoding a value. First, if the value is a primitive of some sort, it is encoded directly into the constant table. Multiple references to the same primitive are
// elided by reusing existing constant table entries; this is valid because primitives are extensional. Each reference has its 'value' stored, along with a table of its local key/value pairs.
// Each key and value is an index into the constant table. So, for example, here is how an object is encoded:

// | {hello: 'world'}   ->   ['hello', 'world', [5, 0, 1, [], [9, 10]], 11]

// The last value in the toplevel array is the logical index of the one that was serialized. The object's encoding arises because it is an object (5) with a stream-local ID (0), no particularly
// interesting value (1 -> null), no array-indexed properties ([]), and one key/value pair ('hello' -> 'world'). 'hello' is at position 9 because of the preloaded constants, and 'world' is at
// position 10. Every reference type has all five of these fields.

    statics                                       = capture [unknown = "this -se [it.id = _]".qf -se [it.prototype /-$.merge/ capture [toString() = '<#unknown #{this.id}>']]],

    key()                                         = n[22] *[String.fromCharCode(Math.random() * 94 + 33 >>> 0)] -seq -re- it.join(''),
    precoded_values                               = [void 0, null, false, true, ''/'', -1/0, 1/0, 0, ''],
    structural_reference_types                    = [Boolean, Number, String, Array, Object, Date, RegExp, Function],

    shift                                         = precoded_values.length,
    shift1                                        = shift - 1,

    encoder(locals, k, xs, c, encode = result)(v) = position_of(v) -or- store(v) -re- +it
                                            -where [ref_detector          = new String(key()),
                                                    is_precoded(v)        = !v || v.constructor === Number && !isFinite(v) -or- isNaN(v) || v === true,
                                                    is_reference(v)       = (v[ref_detector] = ref_detector) -re [v[ref_detector] === ref_detector] -se- delete v[ref_detector],

                                                    precoded_index_of(v)  = precoded_values /~indexOf/ v -re [it === -1 && isNaN(v) ? 4 : it],

                                                    position_of(v)        = v /!is_precoded ? new Number(precoded_index_of(v)) : v /!is_reference ? v[k] : c['@#{(typeof v).charAt(0)}#{v}'],
                                                    store(v)              = v /!is_reference ? store_reference(locals[k] = v, k) -where [k = key()] -se- visit(v)
                                                                                             : c['@#{(typeof v).charAt(0)}#{v}'] = shift1 + xs /~push/ v,

                                                    store_reference(v, i) = v[k] = shift1 + xs /~push/ [type_of(v), i, value_of(v), []],

                                                    type_of(v)            = structural_reference_types /~indexOf/ v.constructor + 1,
                                                    value_of(v)           = v.constructor === Boolean || v.constructor === Number || v.constructor === Date     ? encode(v.valueOf()) :
                                                                            v.constructor === String  || v.constructor === RegExp || v.constructor === Function ? encode(v.toString()) : [],

                                                    visit(v)              = where [ref = xs[position_of(v) - shift], encode_pair(p) = ref[3] / encode(p[0]) /~push/ encode(p[1])]
                                                                                  [v instanceof Array
                                                                                     ? v %k%[x !== k && !(/^\d+$/.test(x) && +x >= 0 && +x < v.length)] /pairs *!encode_pair -seq
                                                                                       -se [ref[2] = v *encode -seq]
                                                                                     : v %k%[x !== k] /pairs *!encode_pair -seq]],
    decode(locals, xs) = ref(values, values.pop())
                 -where [was_local                     = {},
                         reconstitute(o, i)            = o.constructor === Array ? (was_local[i] = locals[o[1]]) || reconstitute_reference(o, xs) : o,
                         reconstitute_reference(o)     = o[0] === 4        ? [] :
                                                         o[0] === 8        ? safely_rebuild_function(xs /-ref/ o[2]) :
                                                         o[0] === 7        ? /^\/(.*)\/([^\/]*)$/.exec(xs /-ref/ o[2]) -re [new RegExp(it[1], it[2])] :
                                                         o[0] && o[0] <= 8 ? new structural_reference_types[o[0] - 1](xs /-ref/ o[2]) :
                                                                             new $.serialization.unknown(o[1]),

                         ref(xs, index)                = index >= shift ? xs[index - shift] : precoded_values[index],

                         safely_rebuild_function(code) = $ /~compile/ parsed
                                                  -when [parsed /!looks_like_a_function || parsed[0].data === '(' && parsed[0] /!looks_like_a_function]
                                                 -where [parsed                   = $ /~parse/ code,
                                                         looks_like_a_function(t) = t.data === 'function' && t[0].data === '(' && t[1].data === '{'],

                         relink(serialized, objects)   = serialized *!link_object_properties *!link_array_properties -seq
                                                 -where [has_links(x)                                    = x.constructor === Array && !was_local[this.xi],
                                                         has_indexes(x)                                  = x /!has_links && x[0] === 4,
                                                         link_object_properties(s, o = objects[this.xi]) = s[3] *![o[objects /-ref/ x] = objects /-ref/ xs[++xi]] -seq -when- s /!has_links,
                                                         link_array_properties (s, o = objects[this.xi]) = s[2] *![o.push(objects /-ref/ x)]                      -seq -when- s /!has_indexes],

                         values                        = xs *[reconstitute(x, xi)] -seq -se- relink(xs, it)],

    stream(self = result) = "self /~encode/ _".qf /-$.merge/ capture [locals    = {},
                                                                      encode(v) = xs /~push/ value_index -re- xs
                                                                          -where [k           = key(),
                                                                                  xs          = [],
                                                                                  unmark(xs)  = xs %[x.constructor === Array] *![delete self.locals[x[1]][k]] -seq,
                                                                                  value_index = encoder(self.locals, k, xs, {})(v) -se- unmark(xs)],

                                                                      decode(v) = decode(self.locals, v)]]})(caterwaul);

// Generated by SDoc 
