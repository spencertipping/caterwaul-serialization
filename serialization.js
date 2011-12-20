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
// Serialized values are stored as printable ASCII strings, just like in Rather Insane Serialization. However, the format is not backwards-compatible in the general case. The following Javascript
// values are encoded as predefined constants, as before:

// | 0. undefined
//   1. null
//   2. value-type false
//   3. value-type true
//   4. value-type NaN
//   5. value-type -Infinity
//   6. value-type +Infinity
//   7. value-type 0

// Unlike the previous format, however, every value has a two-character prefix that indicates both its type and its serialized length. This prefix provides enough information to delegate to a
// separate decoder for that type of value. The following types are encoded:

// | 0. Unknown (used for opaque value encoding)
//   1. Reference boolean
//   2. Reference number
//   3. Reference string
//   4. Array
//   5. Object
//   6. Date
//   7. Regexp
//   8. Function (no closure support, unfortunately; but local referencing is used)
//   9. Primitive integer
//  10. Primitive floating-point number
//  11. Primitive escape-encoded string

// This library leaves the remaining 83 spaces open for future use. Lengths are encoded as variable-length 53-bit integers (more on this below). Then the data representing the object follows for
// the next <length> bytes. (It's safe to assume bytes in a UTF-8 world because all encoded characters fall within the range 33-126, inclusive.)

  $.serialization = new_stream,
  where [coders = wcapture [

  // Numeric encoding.
//   There are two ways to encode numbers. One is used for integers, and the other is used for floating-point numbers. The format is similar to the one used in Rather Insane Serialization.
//   Integers use a variable-length encoding that can handle up to 53 bits (8.08 bytes of entropy using base-94 encoding). Small numbers are preferred to large ones; that is, they take up less
//   space. The format uses the first character to determine the length and supply some entropy. Specifically:

  // | 1. The first character is 33 - 109: interpret literally as a single-character unsigned integer between 0 and 76, inclusive.
//     2. The first character is 110 - 117: encodes a length between 2 and 9, inclusive; the following characters are unsigned negative base-94 integer digits.
//     3. The first character is 118 - 125: encodes a length between 2 and 9, inclusive; the following characters are unsigned positive base-94 integer digits.

           char_encode(n)     = String.fromCharCode(n + 33),
           char_decode(c)     = c.charCodeAt(0) - 33,

           radix_encode(n, l) = n /~![base <= n || xi <= l][(n / (base *= 94) >>> 0) % 94 /!char_encode] *[xs[xl - xi - 1]] -seq -re- it.slice(1).join('') -where [base = 1 / 94],
           radix_decode(s)    = s.split('') *[xs[xl - xi - 1]] /[0][x0 + char_decode(x) * (base *= 94)] -seq -where [base = 1 / 94],

           integer_encode(n)  = n >= 0 && n <= 76 ? char_encode(n) : (n < 0 ? l + digits -where [l = String.fromCharCode(digits.length + 108)]
                                                                            : l + digits -where [l = String.fromCharCode(digits.length + 116)]) -where [digits = radix_encode(Math.abs(n), 2)],

           integer_decode(s)  = where [c = char_decode(s)] [c <= 76 ? c : c <= 84 ? -radix_decode(s.substr(1, c - 74)) : radix_decode(s.substr(1, c - 82))],

  // Floating-point encoding.
//   This is totally lame, but is basically guaranteed not to lose precision across serialization/deserialization. We just convert the number to a string and prefix it with its length. All of the
//   characters used for numeric encoding are valid base-94 characters as well.

           float_encode(n) = '' + n,
           float_decode(s) = +s,

  // String encoding.
//   A string is encoded as its encoded length followed by its escaped characters. The escape encoding used here is identical to the one used in Rather Insane Serialization.

           escape_encode(s) = s.split('') *[x.charCodeAt(0)] *encode -seq -re- it.join('') -where [chr(n)    = String.fromCharCode(n),
                                                                                                   encode(c) = c >= 43 && c <= 126 ? c /!chr : c <= 42 ? '!#{chr(33 + c)}' :
                                                                                                               c <= 126 + 84 - 43  ? '!#{chr(33 + c - 126 + 43)}' :
                                                                                                               c <= 255            ? '"#{chr(33 + c - 126 + 43 - 94)}' :
                                                                                                                                     radix_encode(2 * 94 * 94 + c)],

           escape_decode(s) = s.split('') *[x.charCodeAt(0)] %[x >= 33 && x <= 126] *[x <= 34 ? escape2(x, xs[++xi]) : x <= 42 ? escape3(x, xs[++xi], xs[++xi]) : x] *chr -seq -re- it.join('')
                      -where [chr(x) = String.fromCharCode(x), escape2(d1, d2)     = radix_decode(chr(d1) + chr(d2)) -re [it > 43 ? it + 126 - 43 : it],
                                                               escape3(d1, d2, d3) = radix_decode(chr(d1) + chr(d2) + chr(d3)) - 2 * 94 * 94]],

// Packet encoding.
// Each serialized value is wrapped inside of a packet. This is simply a prefix consisting of a type marker (one of the aforementioned ones) and the length of the packet's encoded data in
// characters. Decoding is done by slicing the string and delegating to the decoder in question. We hand the decoder the string without either the type or the length prefix.

         packet_encode(flag, s) = coders.char_encode(flag) + coders.integer_encode(s.length) + s,
         packet_decode(s, i)    = {flag: coders.char_decode(s.charAt(i)), length: skip + l + 1, data: s.substr(skip + i, l)} -where [l    = coders.integer_decode(s.substr(i + 1, 9)),
                                                                                                                                     skip = coders.integer_encode(l).length],

// Value coding.
// This is where actual low-level values are encoded and decoded. The logic here decides which low-level coder to use, manages the object graph, and assigns type flags to the packets that are
// generated. Like Rather Insane Serialization, property names are encoded as constants. Unlike Rather Insane Serialization, reference types each have a graph component that describes any
// properties that have been set on them. Reference types also have stream-specific object identifiers that are later used to reconstruct the originals if the same stream is used. (If a different
// stream is used, unknowns will be instances of caterwaul.serialization.unknown and will have no useful properties or methods.)

         unknown(key) = this -se [it.object_id = key],


    ]})(caterwaul);

// Generated by SDoc 
