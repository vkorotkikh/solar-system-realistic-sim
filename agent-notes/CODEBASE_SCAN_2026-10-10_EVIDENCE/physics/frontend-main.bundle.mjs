// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/node_modules/three/build/three.core.js
var REVISION = "182";
var PCFShadowMap = 1;
var VSMShadowMap = 3;
var NeverDepth = 0;
var AlwaysDepth = 1;
var LessDepth = 2;
var LessEqualDepth = 3;
var EqualDepth = 4;
var GreaterEqualDepth = 5;
var GreaterDepth = 6;
var NotEqualDepth = 7;
var MultiplyOperation = 0;
var MixOperation = 1;
var AddOperation = 2;
var LinearToneMapping = 1;
var ReinhardToneMapping = 2;
var CineonToneMapping = 3;
var ACESFilmicToneMapping = 4;
var CustomToneMapping = 5;
var AgXToneMapping = 6;
var NeutralToneMapping = 7;
var UVMapping = 300;
var CubeReflectionMapping = 301;
var CubeRefractionMapping = 302;
var CubeUVReflectionMapping = 306;
var RepeatWrapping = 1e3;
var ClampToEdgeWrapping = 1001;
var MirroredRepeatWrapping = 1002;
var LinearFilter = 1006;
var LinearMipmapLinearFilter = 1008;
var UnsignedByteType = 1009;
var RGBAFormat = 1023;
var InterpolateDiscrete = 2300;
var InterpolateLinear = 2301;
var InterpolateSmooth = 2302;
var ZeroCurvatureEnding = 2400;
var ZeroSlopeEnding = 2401;
var WrapAroundEnding = 2402;
var NoColorSpace = "";
var SRGBColorSpace = "srgb";
var LinearSRGBColorSpace = "srgb-linear";
var LinearTransfer = "linear";
var SRGBTransfer = "srgb";
var WebGLCoordinateSystem = 2e3;
var WebGPUCoordinateSystem = 2001;
function isTypedArray(array) {
  return ArrayBuffer.isView(array) && !(array instanceof DataView);
}
function createElementNS(name) {
  return document.createElementNS("http://www.w3.org/1999/xhtml", name);
}
var _cache = {};
var _setConsoleFunction = null;
function warn(...params) {
  const message = "THREE." + params.shift();
  if (_setConsoleFunction) {
    _setConsoleFunction("warn", message, ...params);
  } else {
    console.warn(message, ...params);
  }
}
function error(...params) {
  const message = "THREE." + params.shift();
  if (_setConsoleFunction) {
    _setConsoleFunction("error", message, ...params);
  } else {
    console.error(message, ...params);
  }
}
function warnOnce(...params) {
  const message = params.join(" ");
  if (message in _cache) return;
  _cache[message] = true;
  warn(...params);
}
var EventDispatcher = class {
  /**
   * Adds the given event listener to the given event type.
   *
   * @param {string} type - The type of event to listen to.
   * @param {Function} listener - The function that gets called when the event is fired.
   */
  addEventListener(type, listener) {
    if (this._listeners === void 0) this._listeners = {};
    const listeners = this._listeners;
    if (listeners[type] === void 0) {
      listeners[type] = [];
    }
    if (listeners[type].indexOf(listener) === -1) {
      listeners[type].push(listener);
    }
  }
  /**
   * Returns `true` if the given event listener has been added to the given event type.
   *
   * @param {string} type - The type of event.
   * @param {Function} listener - The listener to check.
   * @return {boolean} Whether the given event listener has been added to the given event type.
   */
  hasEventListener(type, listener) {
    const listeners = this._listeners;
    if (listeners === void 0) return false;
    return listeners[type] !== void 0 && listeners[type].indexOf(listener) !== -1;
  }
  /**
   * Removes the given event listener from the given event type.
   *
   * @param {string} type - The type of event.
   * @param {Function} listener - The listener to remove.
   */
  removeEventListener(type, listener) {
    const listeners = this._listeners;
    if (listeners === void 0) return;
    const listenerArray = listeners[type];
    if (listenerArray !== void 0) {
      const index = listenerArray.indexOf(listener);
      if (index !== -1) {
        listenerArray.splice(index, 1);
      }
    }
  }
  /**
   * Dispatches an event object.
   *
   * @param {Object} event - The event that gets fired.
   */
  dispatchEvent(event) {
    const listeners = this._listeners;
    if (listeners === void 0) return;
    const listenerArray = listeners[event.type];
    if (listenerArray !== void 0) {
      event.target = this;
      const array = listenerArray.slice(0);
      for (let i = 0, l = array.length; i < l; i++) {
        array[i].call(this, event);
      }
      event.target = null;
    }
  }
};
var _lut = ["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0a", "0b", "0c", "0d", "0e", "0f", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "1a", "1b", "1c", "1d", "1e", "1f", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2a", "2b", "2c", "2d", "2e", "2f", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "3a", "3b", "3c", "3d", "3e", "3f", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "4a", "4b", "4c", "4d", "4e", "4f", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "5a", "5b", "5c", "5d", "5e", "5f", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "6a", "6b", "6c", "6d", "6e", "6f", "70", "71", "72", "73", "74", "75", "76", "77", "78", "79", "7a", "7b", "7c", "7d", "7e", "7f", "80", "81", "82", "83", "84", "85", "86", "87", "88", "89", "8a", "8b", "8c", "8d", "8e", "8f", "90", "91", "92", "93", "94", "95", "96", "97", "98", "99", "9a", "9b", "9c", "9d", "9e", "9f", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "aa", "ab", "ac", "ad", "ae", "af", "b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "ba", "bb", "bc", "bd", "be", "bf", "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "ca", "cb", "cc", "cd", "ce", "cf", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "da", "db", "dc", "dd", "de", "df", "e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "ea", "eb", "ec", "ed", "ee", "ef", "f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "fa", "fb", "fc", "fd", "fe", "ff"];
var DEG2RAD = Math.PI / 180;
var RAD2DEG = 180 / Math.PI;
function generateUUID() {
  const d0 = Math.random() * 4294967295 | 0;
  const d1 = Math.random() * 4294967295 | 0;
  const d2 = Math.random() * 4294967295 | 0;
  const d3 = Math.random() * 4294967295 | 0;
  const uuid = _lut[d0 & 255] + _lut[d0 >> 8 & 255] + _lut[d0 >> 16 & 255] + _lut[d0 >> 24 & 255] + "-" + _lut[d1 & 255] + _lut[d1 >> 8 & 255] + "-" + _lut[d1 >> 16 & 15 | 64] + _lut[d1 >> 24 & 255] + "-" + _lut[d2 & 63 | 128] + _lut[d2 >> 8 & 255] + "-" + _lut[d2 >> 16 & 255] + _lut[d2 >> 24 & 255] + _lut[d3 & 255] + _lut[d3 >> 8 & 255] + _lut[d3 >> 16 & 255] + _lut[d3 >> 24 & 255];
  return uuid.toLowerCase();
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function euclideanModulo(n, m) {
  return (n % m + m) % m;
}
function lerp(x, y, t) {
  return (1 - t) * x + t * y;
}
var Vector2 = class _Vector2 {
  /**
   * Constructs a new 2D vector.
   *
   * @param {number} [x=0] - The x value of this vector.
   * @param {number} [y=0] - The y value of this vector.
   */
  constructor(x = 0, y = 0) {
    _Vector2.prototype.isVector2 = true;
    this.x = x;
    this.y = y;
  }
  /**
   * Alias for {@link Vector2#x}.
   *
   * @type {number}
   */
  get width() {
    return this.x;
  }
  set width(value) {
    this.x = value;
  }
  /**
   * Alias for {@link Vector2#y}.
   *
   * @type {number}
   */
  get height() {
    return this.y;
  }
  set height(value) {
    this.y = value;
  }
  /**
   * Sets the vector components.
   *
   * @param {number} x - The value of the x component.
   * @param {number} y - The value of the y component.
   * @return {Vector2} A reference to this vector.
   */
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  /**
   * Sets the vector components to the same value.
   *
   * @param {number} scalar - The value to set for all vector components.
   * @return {Vector2} A reference to this vector.
   */
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    return this;
  }
  /**
   * Sets the vector's x component to the given value
   *
   * @param {number} x - The value to set.
   * @return {Vector2} A reference to this vector.
   */
  setX(x) {
    this.x = x;
    return this;
  }
  /**
   * Sets the vector's y component to the given value
   *
   * @param {number} y - The value to set.
   * @return {Vector2} A reference to this vector.
   */
  setY(y) {
    this.y = y;
    return this;
  }
  /**
   * Allows to set a vector component with an index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y.
   * @param {number} value - The value to set.
   * @return {Vector2} A reference to this vector.
   */
  setComponent(index, value) {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      default:
        throw new Error("index is out of range: " + index);
    }
    return this;
  }
  /**
   * Returns the value of the vector component which matches the given index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y.
   * @return {number} A vector component value.
   */
  getComponent(index) {
    switch (index) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      default:
        throw new Error("index is out of range: " + index);
    }
  }
  /**
   * Returns a new vector with copied values from this instance.
   *
   * @return {Vector2} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.x, this.y);
  }
  /**
   * Copies the values of the given vector to this instance.
   *
   * @param {Vector2} v - The vector to copy.
   * @return {Vector2} A reference to this vector.
   */
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }
  /**
   * Adds the given vector to this instance.
   *
   * @param {Vector2} v - The vector to add.
   * @return {Vector2} A reference to this vector.
   */
  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }
  /**
   * Adds the given scalar value to all components of this instance.
   *
   * @param {number} s - The scalar to add.
   * @return {Vector2} A reference to this vector.
   */
  addScalar(s) {
    this.x += s;
    this.y += s;
    return this;
  }
  /**
   * Adds the given vectors and stores the result in this instance.
   *
   * @param {Vector2} a - The first vector.
   * @param {Vector2} b - The second vector.
   * @return {Vector2} A reference to this vector.
   */
  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    return this;
  }
  /**
   * Adds the given vector scaled by the given factor to this instance.
   *
   * @param {Vector2} v - The vector.
   * @param {number} s - The factor that scales `v`.
   * @return {Vector2} A reference to this vector.
   */
  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    return this;
  }
  /**
   * Subtracts the given vector from this instance.
   *
   * @param {Vector2} v - The vector to subtract.
   * @return {Vector2} A reference to this vector.
   */
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }
  /**
   * Subtracts the given scalar value from all components of this instance.
   *
   * @param {number} s - The scalar to subtract.
   * @return {Vector2} A reference to this vector.
   */
  subScalar(s) {
    this.x -= s;
    this.y -= s;
    return this;
  }
  /**
   * Subtracts the given vectors and stores the result in this instance.
   *
   * @param {Vector2} a - The first vector.
   * @param {Vector2} b - The second vector.
   * @return {Vector2} A reference to this vector.
   */
  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    return this;
  }
  /**
   * Multiplies the given vector with this instance.
   *
   * @param {Vector2} v - The vector to multiply.
   * @return {Vector2} A reference to this vector.
   */
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    return this;
  }
  /**
   * Multiplies the given scalar value with all components of this instance.
   *
   * @param {number} scalar - The scalar to multiply.
   * @return {Vector2} A reference to this vector.
   */
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }
  /**
   * Divides this instance by the given vector.
   *
   * @param {Vector2} v - The vector to divide.
   * @return {Vector2} A reference to this vector.
   */
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    return this;
  }
  /**
   * Divides this vector by the given scalar.
   *
   * @param {number} scalar - The scalar to divide.
   * @return {Vector2} A reference to this vector.
   */
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  /**
   * Multiplies this vector (with an implicit 1 as the 3rd component) by
   * the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix to apply.
   * @return {Vector2} A reference to this vector.
   */
  applyMatrix3(m) {
    const x = this.x, y = this.y;
    const e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6];
    this.y = e[1] * x + e[4] * y + e[7];
    return this;
  }
  /**
   * If this vector's x or y value is greater than the given vector's x or y
   * value, replace that value with the corresponding min value.
   *
   * @param {Vector2} v - The vector.
   * @return {Vector2} A reference to this vector.
   */
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    return this;
  }
  /**
   * If this vector's x or y value is less than the given vector's x or y
   * value, replace that value with the corresponding max value.
   *
   * @param {Vector2} v - The vector.
   * @return {Vector2} A reference to this vector.
   */
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    return this;
  }
  /**
   * If this vector's x or y value is greater than the max vector's x or y
   * value, it is replaced by the corresponding value.
   * If this vector's x or y value is less than the min vector's x or y value,
   * it is replaced by the corresponding value.
   *
   * @param {Vector2} min - The minimum x and y values.
   * @param {Vector2} max - The maximum x and y values in the desired range.
   * @return {Vector2} A reference to this vector.
   */
  clamp(min, max) {
    this.x = clamp(this.x, min.x, max.x);
    this.y = clamp(this.y, min.y, max.y);
    return this;
  }
  /**
   * If this vector's x or y values are greater than the max value, they are
   * replaced by the max value.
   * If this vector's x or y values are less than the min value, they are
   * replaced by the min value.
   *
   * @param {number} minVal - The minimum value the components will be clamped to.
   * @param {number} maxVal - The maximum value the components will be clamped to.
   * @return {Vector2} A reference to this vector.
   */
  clampScalar(minVal, maxVal) {
    this.x = clamp(this.x, minVal, maxVal);
    this.y = clamp(this.y, minVal, maxVal);
    return this;
  }
  /**
   * If this vector's length is greater than the max value, it is replaced by
   * the max value.
   * If this vector's length is less than the min value, it is replaced by the
   * min value.
   *
   * @param {number} min - The minimum value the vector length will be clamped to.
   * @param {number} max - The maximum value the vector length will be clamped to.
   * @return {Vector2} A reference to this vector.
   */
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(clamp(length, min, max));
  }
  /**
   * The components of this vector are rounded down to the nearest integer value.
   *
   * @return {Vector2} A reference to this vector.
   */
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    return this;
  }
  /**
   * The components of this vector are rounded up to the nearest integer value.
   *
   * @return {Vector2} A reference to this vector.
   */
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    return this;
  }
  /**
   * The components of this vector are rounded to the nearest integer value
   *
   * @return {Vector2} A reference to this vector.
   */
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    return this;
  }
  /**
   * The components of this vector are rounded towards zero (up if negative,
   * down if positive) to an integer value.
   *
   * @return {Vector2} A reference to this vector.
   */
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    return this;
  }
  /**
   * Inverts this vector - i.e. sets x = -x and y = -y.
   *
   * @return {Vector2} A reference to this vector.
   */
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }
  /**
   * Calculates the dot product of the given vector with this instance.
   *
   * @param {Vector2} v - The vector to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this.x * v.x + this.y * v.y;
  }
  /**
   * Calculates the cross product of the given vector with this instance.
   *
   * @param {Vector2} v - The vector to compute the cross product with.
   * @return {number} The result of the cross product.
   */
  cross(v) {
    return this.x * v.y - this.y * v.x;
  }
  /**
   * Computes the square of the Euclidean length (straight-line length) from
   * (0, 0) to (x, y). If you are comparing the lengths of vectors, you should
   * compare the length squared instead as it is slightly more efficient to calculate.
   *
   * @return {number} The square length of this vector.
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }
  /**
   * Computes the  Euclidean length (straight-line length) from (0, 0) to (x, y).
   *
   * @return {number} The length of this vector.
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  /**
   * Computes the Manhattan length of this vector.
   *
   * @return {number} The length of this vector.
   */
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y);
  }
  /**
   * Converts this vector to a unit vector - that is, sets it equal to a vector
   * with the same direction as this one, but with a vector length of `1`.
   *
   * @return {Vector2} A reference to this vector.
   */
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  /**
   * Computes the angle in radians of this vector with respect to the positive x-axis.
   *
   * @return {number} The angle in radians.
   */
  angle() {
    const angle = Math.atan2(-this.y, -this.x) + Math.PI;
    return angle;
  }
  /**
   * Returns the angle between the given vector and this instance in radians.
   *
   * @param {Vector2} v - The vector to compute the angle with.
   * @return {number} The angle in radians.
   */
  angleTo(v) {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(clamp(theta, -1, 1));
  }
  /**
   * Computes the distance from the given vector to this instance.
   *
   * @param {Vector2} v - The vector to compute the distance to.
   * @return {number} The distance.
   */
  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v));
  }
  /**
   * Computes the squared distance from the given vector to this instance.
   * If you are just comparing the distance with another distance, you should compare
   * the distance squared instead as it is slightly more efficient to calculate.
   *
   * @param {Vector2} v - The vector to compute the squared distance to.
   * @return {number} The squared distance.
   */
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y;
    return dx * dx + dy * dy;
  }
  /**
   * Computes the Manhattan distance from the given vector to this instance.
   *
   * @param {Vector2} v - The vector to compute the Manhattan distance to.
   * @return {number} The Manhattan distance.
   */
  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y);
  }
  /**
   * Sets this vector to a vector with the same direction as this one, but
   * with the specified length.
   *
   * @param {number} length - The new length of this vector.
   * @return {Vector2} A reference to this vector.
   */
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  /**
   * Linearly interpolates between the given vector and this instance, where
   * alpha is the percent distance along the line - alpha = 0 will be this
   * vector, and alpha = 1 will be the given one.
   *
   * @param {Vector2} v - The vector to interpolate towards.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector2} A reference to this vector.
   */
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given vectors, where alpha is the percent
   * distance along the line - alpha = 0 will be first vector, and alpha = 1 will
   * be the second one. The result is stored in this instance.
   *
   * @param {Vector2} v1 - The first vector.
   * @param {Vector2} v2 - The second vector.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector2} A reference to this vector.
   */
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    return this;
  }
  /**
   * Returns `true` if this vector is equal with the given one.
   *
   * @param {Vector2} v - The vector to test for equality.
   * @return {boolean} Whether this vector is equal with the given one.
   */
  equals(v) {
    return v.x === this.x && v.y === this.y;
  }
  /**
   * Sets this vector's x value to be `array[ offset ]` and y
   * value to be `array[ offset + 1 ]`.
   *
   * @param {Array<number>} array - An array holding the vector component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Vector2} A reference to this vector.
   */
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    return this;
  }
  /**
   * Writes the components of this vector to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the vector components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The vector components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    return array;
  }
  /**
   * Sets the components of this vector from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding vector data.
   * @param {number} index - The index into the attribute.
   * @return {Vector2} A reference to this vector.
   */
  fromBufferAttribute(attribute, index) {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    return this;
  }
  /**
   * Rotates this vector around the given center by the given angle.
   *
   * @param {Vector2} center - The point around which to rotate.
   * @param {number} angle - The angle to rotate, in radians.
   * @return {Vector2} A reference to this vector.
   */
  rotateAround(center, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const x = this.x - center.x;
    const y = this.y - center.y;
    this.x = x * c - y * s + center.x;
    this.y = x * s + y * c + center.y;
    return this;
  }
  /**
   * Sets each component of this vector to a pseudo-random value between `0` and
   * `1`, excluding `1`.
   *
   * @return {Vector2} A reference to this vector.
   */
  random() {
    this.x = Math.random();
    this.y = Math.random();
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
  }
};
var Quaternion = class {
  /**
   * Constructs a new quaternion.
   *
   * @param {number} [x=0] - The x value of this quaternion.
   * @param {number} [y=0] - The y value of this quaternion.
   * @param {number} [z=0] - The z value of this quaternion.
   * @param {number} [w=1] - The w value of this quaternion.
   */
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.isQuaternion = true;
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
  }
  /**
   * Interpolates between two quaternions via SLERP. This implementation assumes the
   * quaternion data are managed in flat arrays.
   *
   * @param {Array<number>} dst - The destination array.
   * @param {number} dstOffset - An offset into the destination array.
   * @param {Array<number>} src0 - The source array of the first quaternion.
   * @param {number} srcOffset0 - An offset into the first source array.
   * @param {Array<number>} src1 -  The source array of the second quaternion.
   * @param {number} srcOffset1 - An offset into the second source array.
   * @param {number} t - The interpolation factor in the range `[0,1]`.
   * @see {@link Quaternion#slerp}
   */
  static slerpFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1, t) {
    let x0 = src0[srcOffset0 + 0], y0 = src0[srcOffset0 + 1], z0 = src0[srcOffset0 + 2], w0 = src0[srcOffset0 + 3];
    let x1 = src1[srcOffset1 + 0], y1 = src1[srcOffset1 + 1], z1 = src1[srcOffset1 + 2], w1 = src1[srcOffset1 + 3];
    if (t <= 0) {
      dst[dstOffset + 0] = x0;
      dst[dstOffset + 1] = y0;
      dst[dstOffset + 2] = z0;
      dst[dstOffset + 3] = w0;
      return;
    }
    if (t >= 1) {
      dst[dstOffset + 0] = x1;
      dst[dstOffset + 1] = y1;
      dst[dstOffset + 2] = z1;
      dst[dstOffset + 3] = w1;
      return;
    }
    if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
      let dot = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
      if (dot < 0) {
        x1 = -x1;
        y1 = -y1;
        z1 = -z1;
        w1 = -w1;
        dot = -dot;
      }
      let s = 1 - t;
      if (dot < 0.9995) {
        const theta = Math.acos(dot);
        const sin = Math.sin(theta);
        s = Math.sin(s * theta) / sin;
        t = Math.sin(t * theta) / sin;
        x0 = x0 * s + x1 * t;
        y0 = y0 * s + y1 * t;
        z0 = z0 * s + z1 * t;
        w0 = w0 * s + w1 * t;
      } else {
        x0 = x0 * s + x1 * t;
        y0 = y0 * s + y1 * t;
        z0 = z0 * s + z1 * t;
        w0 = w0 * s + w1 * t;
        const f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
        x0 *= f;
        y0 *= f;
        z0 *= f;
        w0 *= f;
      }
    }
    dst[dstOffset] = x0;
    dst[dstOffset + 1] = y0;
    dst[dstOffset + 2] = z0;
    dst[dstOffset + 3] = w0;
  }
  /**
   * Multiplies two quaternions. This implementation assumes the quaternion data are managed
   * in flat arrays.
   *
   * @param {Array<number>} dst - The destination array.
   * @param {number} dstOffset - An offset into the destination array.
   * @param {Array<number>} src0 - The source array of the first quaternion.
   * @param {number} srcOffset0 - An offset into the first source array.
   * @param {Array<number>} src1 -  The source array of the second quaternion.
   * @param {number} srcOffset1 - An offset into the second source array.
   * @return {Array<number>} The destination array.
   * @see {@link Quaternion#multiplyQuaternions}.
   */
  static multiplyQuaternionsFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1) {
    const x0 = src0[srcOffset0];
    const y0 = src0[srcOffset0 + 1];
    const z0 = src0[srcOffset0 + 2];
    const w0 = src0[srcOffset0 + 3];
    const x1 = src1[srcOffset1];
    const y1 = src1[srcOffset1 + 1];
    const z1 = src1[srcOffset1 + 2];
    const w1 = src1[srcOffset1 + 3];
    dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1;
    dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1;
    dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1;
    dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1;
    return dst;
  }
  /**
   * The x value of this quaternion.
   *
   * @type {number}
   * @default 0
   */
  get x() {
    return this._x;
  }
  set x(value) {
    this._x = value;
    this._onChangeCallback();
  }
  /**
   * The y value of this quaternion.
   *
   * @type {number}
   * @default 0
   */
  get y() {
    return this._y;
  }
  set y(value) {
    this._y = value;
    this._onChangeCallback();
  }
  /**
   * The z value of this quaternion.
   *
   * @type {number}
   * @default 0
   */
  get z() {
    return this._z;
  }
  set z(value) {
    this._z = value;
    this._onChangeCallback();
  }
  /**
   * The w value of this quaternion.
   *
   * @type {number}
   * @default 1
   */
  get w() {
    return this._w;
  }
  set w(value) {
    this._w = value;
    this._onChangeCallback();
  }
  /**
   * Sets the quaternion components.
   *
   * @param {number} x - The x value of this quaternion.
   * @param {number} y - The y value of this quaternion.
   * @param {number} z - The z value of this quaternion.
   * @param {number} w - The w value of this quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  set(x, y, z, w) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this._onChangeCallback();
    return this;
  }
  /**
   * Returns a new quaternion with copied values from this instance.
   *
   * @return {Quaternion} A clone of this instance.
   */
  clone() {
    return new this.constructor(this._x, this._y, this._z, this._w);
  }
  /**
   * Copies the values of the given quaternion to this instance.
   *
   * @param {Quaternion} quaternion - The quaternion to copy.
   * @return {Quaternion} A reference to this quaternion.
   */
  copy(quaternion) {
    this._x = quaternion.x;
    this._y = quaternion.y;
    this._z = quaternion.z;
    this._w = quaternion.w;
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion from the rotation specified by the given
   * Euler angles.
   *
   * @param {Euler} euler - The Euler angles.
   * @param {boolean} [update=true] - Whether the internal `onChange` callback should be executed or not.
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromEuler(euler, update = true) {
    const x = euler._x, y = euler._y, z = euler._z, order = euler._order;
    const cos = Math.cos;
    const sin = Math.sin;
    const c1 = cos(x / 2);
    const c2 = cos(y / 2);
    const c3 = cos(z / 2);
    const s1 = sin(x / 2);
    const s2 = sin(y / 2);
    const s3 = sin(z / 2);
    switch (order) {
      case "XYZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "YXZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "ZXY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "ZYX":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "YZX":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "XZY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      default:
        warn("Quaternion: .setFromEuler() encountered an unknown order: " + order);
    }
    if (update === true) this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion from the given axis and angle.
   *
   * @param {Vector3} axis - The normalized axis.
   * @param {number} angle - The angle in radians.
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2, s = Math.sin(halfAngle);
    this._x = axis.x * s;
    this._y = axis.y * s;
    this._z = axis.z * s;
    this._w = Math.cos(halfAngle);
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion from the given rotation matrix.
   *
   * @param {Matrix4} m - A 4x4 matrix of which the upper 3x3 of matrix is a pure rotation matrix (i.e. unscaled).
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromRotationMatrix(m) {
    const te = m.elements, m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10], trace = m11 + m22 + m33;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      this._w = 0.25 / s;
      this._x = (m32 - m23) * s;
      this._y = (m13 - m31) * s;
      this._z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      this._w = (m32 - m23) / s;
      this._x = 0.25 * s;
      this._y = (m12 + m21) / s;
      this._z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      this._w = (m13 - m31) / s;
      this._x = (m12 + m21) / s;
      this._y = 0.25 * s;
      this._z = (m23 + m32) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
      this._w = (m21 - m12) / s;
      this._x = (m13 + m31) / s;
      this._y = (m23 + m32) / s;
      this._z = 0.25 * s;
    }
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion to the rotation required to rotate the direction vector
   * `vFrom` to the direction vector `vTo`.
   *
   * @param {Vector3} vFrom - The first (normalized) direction vector.
   * @param {Vector3} vTo - The second (normalized) direction vector.
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromUnitVectors(vFrom, vTo) {
    let r = vFrom.dot(vTo) + 1;
    if (r < 1e-8) {
      r = 0;
      if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
        this._x = -vFrom.y;
        this._y = vFrom.x;
        this._z = 0;
        this._w = r;
      } else {
        this._x = 0;
        this._y = -vFrom.z;
        this._z = vFrom.y;
        this._w = r;
      }
    } else {
      this._x = vFrom.y * vTo.z - vFrom.z * vTo.y;
      this._y = vFrom.z * vTo.x - vFrom.x * vTo.z;
      this._z = vFrom.x * vTo.y - vFrom.y * vTo.x;
      this._w = r;
    }
    return this.normalize();
  }
  /**
   * Returns the angle between this quaternion and the given one in radians.
   *
   * @param {Quaternion} q - The quaternion to compute the angle with.
   * @return {number} The angle in radians.
   */
  angleTo(q) {
    return 2 * Math.acos(Math.abs(clamp(this.dot(q), -1, 1)));
  }
  /**
   * Rotates this quaternion by a given angular step to the given quaternion.
   * The method ensures that the final quaternion will not overshoot `q`.
   *
   * @param {Quaternion} q - The target quaternion.
   * @param {number} step - The angular step in radians.
   * @return {Quaternion} A reference to this quaternion.
   */
  rotateTowards(q, step) {
    const angle = this.angleTo(q);
    if (angle === 0) return this;
    const t = Math.min(1, step / angle);
    this.slerp(q, t);
    return this;
  }
  /**
   * Sets this quaternion to the identity quaternion; that is, to the
   * quaternion that represents "no rotation".
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  identity() {
    return this.set(0, 0, 0, 1);
  }
  /**
   * Inverts this quaternion via {@link Quaternion#conjugate}. The
   * quaternion is assumed to have unit length.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  invert() {
    return this.conjugate();
  }
  /**
   * Returns the rotational conjugate of this quaternion. The conjugate of a
   * quaternion represents the same rotation in the opposite direction about
   * the rotational axis.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  conjugate() {
    this._x *= -1;
    this._y *= -1;
    this._z *= -1;
    this._onChangeCallback();
    return this;
  }
  /**
   * Calculates the dot product of this quaternion and the given one.
   *
   * @param {Quaternion} v - The quaternion to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this._x * v._x + this._y * v._y + this._z * v._z + this._w * v._w;
  }
  /**
   * Computes the squared Euclidean length (straight-line length) of this quaternion,
   * considered as a 4 dimensional vector. This can be useful if you are comparing the
   * lengths of two quaternions, as this is a slightly more efficient calculation than
   * {@link Quaternion#length}.
   *
   * @return {number} The squared Euclidean length.
   */
  lengthSq() {
    return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
  }
  /**
   * Computes the Euclidean length (straight-line length) of this quaternion,
   * considered as a 4 dimensional vector.
   *
   * @return {number} The Euclidean length.
   */
  length() {
    return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
  }
  /**
   * Normalizes this quaternion - that is, calculated the quaternion that performs
   * the same rotation as this one, but has a length equal to `1`.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  normalize() {
    let l = this.length();
    if (l === 0) {
      this._x = 0;
      this._y = 0;
      this._z = 0;
      this._w = 1;
    } else {
      l = 1 / l;
      this._x = this._x * l;
      this._y = this._y * l;
      this._z = this._z * l;
      this._w = this._w * l;
    }
    this._onChangeCallback();
    return this;
  }
  /**
   * Multiplies this quaternion by the given one.
   *
   * @param {Quaternion} q - The quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  multiply(q) {
    return this.multiplyQuaternions(this, q);
  }
  /**
   * Pre-multiplies this quaternion by the given one.
   *
   * @param {Quaternion} q - The quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  premultiply(q) {
    return this.multiplyQuaternions(q, this);
  }
  /**
   * Multiplies the given quaternions and stores the result in this instance.
   *
   * @param {Quaternion} a - The first quaternion.
   * @param {Quaternion} b - The second quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  multiplyQuaternions(a, b) {
    const qax = a._x, qay = a._y, qaz = a._z, qaw = a._w;
    const qbx = b._x, qby = b._y, qbz = b._z, qbw = b._w;
    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    this._onChangeCallback();
    return this;
  }
  /**
   * Performs a spherical linear interpolation between quaternions.
   *
   * @param {Quaternion} qb - The target quaternion.
   * @param {number} t - The interpolation factor in the closed interval `[0, 1]`.
   * @return {Quaternion} A reference to this quaternion.
   */
  slerp(qb, t) {
    if (t <= 0) return this;
    if (t >= 1) return this.copy(qb);
    let x = qb._x, y = qb._y, z = qb._z, w = qb._w;
    let dot = this.dot(qb);
    if (dot < 0) {
      x = -x;
      y = -y;
      z = -z;
      w = -w;
      dot = -dot;
    }
    let s = 1 - t;
    if (dot < 0.9995) {
      const theta = Math.acos(dot);
      const sin = Math.sin(theta);
      s = Math.sin(s * theta) / sin;
      t = Math.sin(t * theta) / sin;
      this._x = this._x * s + x * t;
      this._y = this._y * s + y * t;
      this._z = this._z * s + z * t;
      this._w = this._w * s + w * t;
      this._onChangeCallback();
    } else {
      this._x = this._x * s + x * t;
      this._y = this._y * s + y * t;
      this._z = this._z * s + z * t;
      this._w = this._w * s + w * t;
      this.normalize();
    }
    return this;
  }
  /**
   * Performs a spherical linear interpolation between the given quaternions
   * and stores the result in this quaternion.
   *
   * @param {Quaternion} qa - The source quaternion.
   * @param {Quaternion} qb - The target quaternion.
   * @param {number} t - The interpolation factor in the closed interval `[0, 1]`.
   * @return {Quaternion} A reference to this quaternion.
   */
  slerpQuaternions(qa, qb, t) {
    return this.copy(qa).slerp(qb, t);
  }
  /**
   * Sets this quaternion to a uniformly random, normalized quaternion.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  random() {
    const theta1 = 2 * Math.PI * Math.random();
    const theta2 = 2 * Math.PI * Math.random();
    const x0 = Math.random();
    const r1 = Math.sqrt(1 - x0);
    const r2 = Math.sqrt(x0);
    return this.set(
      r1 * Math.sin(theta1),
      r1 * Math.cos(theta1),
      r2 * Math.sin(theta2),
      r2 * Math.cos(theta2)
    );
  }
  /**
   * Returns `true` if this quaternion is equal with the given one.
   *
   * @param {Quaternion} quaternion - The quaternion to test for equality.
   * @return {boolean} Whether this quaternion is equal with the given one.
   */
  equals(quaternion) {
    return quaternion._x === this._x && quaternion._y === this._y && quaternion._z === this._z && quaternion._w === this._w;
  }
  /**
   * Sets this quaternion's components from the given array.
   *
   * @param {Array<number>} array - An array holding the quaternion component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Quaternion} A reference to this quaternion.
   */
  fromArray(array, offset = 0) {
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    this._w = array[offset + 3];
    this._onChangeCallback();
    return this;
  }
  /**
   * Writes the components of this quaternion to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the quaternion components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The quaternion components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._w;
    return array;
  }
  /**
   * Sets the components of this quaternion from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding quaternion data.
   * @param {number} index - The index into the attribute.
   * @return {Quaternion} A reference to this quaternion.
   */
  fromBufferAttribute(attribute, index) {
    this._x = attribute.getX(index);
    this._y = attribute.getY(index);
    this._z = attribute.getZ(index);
    this._w = attribute.getW(index);
    this._onChangeCallback();
    return this;
  }
  /**
   * This methods defines the serialization result of this class. Returns the
   * numerical elements of this quaternion in an array of format `[x, y, z, w]`.
   *
   * @return {Array<number>} The serialized quaternion.
   */
  toJSON() {
    return this.toArray();
  }
  _onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }
  _onChangeCallback() {
  }
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._w;
  }
};
var Vector3 = class _Vector3 {
  /**
   * Constructs a new 3D vector.
   *
   * @param {number} [x=0] - The x value of this vector.
   * @param {number} [y=0] - The y value of this vector.
   * @param {number} [z=0] - The z value of this vector.
   */
  constructor(x = 0, y = 0, z = 0) {
    _Vector3.prototype.isVector3 = true;
    this.x = x;
    this.y = y;
    this.z = z;
  }
  /**
   * Sets the vector components.
   *
   * @param {number} x - The value of the x component.
   * @param {number} y - The value of the y component.
   * @param {number} z - The value of the z component.
   * @return {Vector3} A reference to this vector.
   */
  set(x, y, z) {
    if (z === void 0) z = this.z;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  /**
   * Sets the vector components to the same value.
   *
   * @param {number} scalar - The value to set for all vector components.
   * @return {Vector3} A reference to this vector.
   */
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    return this;
  }
  /**
   * Sets the vector's x component to the given value
   *
   * @param {number} x - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setX(x) {
    this.x = x;
    return this;
  }
  /**
   * Sets the vector's y component to the given value
   *
   * @param {number} y - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setY(y) {
    this.y = y;
    return this;
  }
  /**
   * Sets the vector's z component to the given value
   *
   * @param {number} z - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setZ(z) {
    this.z = z;
    return this;
  }
  /**
   * Allows to set a vector component with an index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y, `2` equals to z.
   * @param {number} value - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setComponent(index, value) {
    switch (index) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      case 2:
        this.z = value;
        break;
      default:
        throw new Error("index is out of range: " + index);
    }
    return this;
  }
  /**
   * Returns the value of the vector component which matches the given index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y, `2` equals to z.
   * @return {number} A vector component value.
   */
  getComponent(index) {
    switch (index) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      default:
        throw new Error("index is out of range: " + index);
    }
  }
  /**
   * Returns a new vector with copied values from this instance.
   *
   * @return {Vector3} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.x, this.y, this.z);
  }
  /**
   * Copies the values of the given vector to this instance.
   *
   * @param {Vector3} v - The vector to copy.
   * @return {Vector3} A reference to this vector.
   */
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  /**
   * Adds the given vector to this instance.
   *
   * @param {Vector3} v - The vector to add.
   * @return {Vector3} A reference to this vector.
   */
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  /**
   * Adds the given scalar value to all components of this instance.
   *
   * @param {number} s - The scalar to add.
   * @return {Vector3} A reference to this vector.
   */
  addScalar(s) {
    this.x += s;
    this.y += s;
    this.z += s;
    return this;
  }
  /**
   * Adds the given vectors and stores the result in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }
  /**
   * Adds the given vector scaled by the given factor to this instance.
   *
   * @param {Vector3|Vector4} v - The vector.
   * @param {number} s - The factor that scales `v`.
   * @return {Vector3} A reference to this vector.
   */
  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }
  /**
   * Subtracts the given vector from this instance.
   *
   * @param {Vector3} v - The vector to subtract.
   * @return {Vector3} A reference to this vector.
   */
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  /**
   * Subtracts the given scalar value from all components of this instance.
   *
   * @param {number} s - The scalar to subtract.
   * @return {Vector3} A reference to this vector.
   */
  subScalar(s) {
    this.x -= s;
    this.y -= s;
    this.z -= s;
    return this;
  }
  /**
   * Subtracts the given vectors and stores the result in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }
  /**
   * Multiplies the given vector with this instance.
   *
   * @param {Vector3} v - The vector to multiply.
   * @return {Vector3} A reference to this vector.
   */
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }
  /**
   * Multiplies the given scalar value with all components of this instance.
   *
   * @param {number} scalar - The scalar to multiply.
   * @return {Vector3} A reference to this vector.
   */
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }
  /**
   * Multiplies the given vectors and stores the result in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  multiplyVectors(a, b) {
    this.x = a.x * b.x;
    this.y = a.y * b.y;
    this.z = a.z * b.z;
    return this;
  }
  /**
   * Applies the given Euler rotation to this vector.
   *
   * @param {Euler} euler - The Euler angles.
   * @return {Vector3} A reference to this vector.
   */
  applyEuler(euler) {
    return this.applyQuaternion(_quaternion$4.setFromEuler(euler));
  }
  /**
   * Applies a rotation specified by an axis and an angle to this vector.
   *
   * @param {Vector3} axis - A normalized vector representing the rotation axis.
   * @param {number} angle - The angle in radians.
   * @return {Vector3} A reference to this vector.
   */
  applyAxisAngle(axis, angle) {
    return this.applyQuaternion(_quaternion$4.setFromAxisAngle(axis, angle));
  }
  /**
   * Multiplies this vector with the given 3x3 matrix.
   *
   * @param {Matrix3} m - The 3x3 matrix.
   * @return {Vector3} A reference to this vector.
   */
  applyMatrix3(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6] * z;
    this.y = e[1] * x + e[4] * y + e[7] * z;
    this.z = e[2] * x + e[5] * y + e[8] * z;
    return this;
  }
  /**
   * Multiplies this vector by the given normal matrix and normalizes
   * the result.
   *
   * @param {Matrix3} m - The normal matrix.
   * @return {Vector3} A reference to this vector.
   */
  applyNormalMatrix(m) {
    return this.applyMatrix3(m).normalize();
  }
  /**
   * Multiplies this vector (with an implicit 1 in the 4th dimension) by m, and
   * divides by perspective.
   *
   * @param {Matrix4} m - The matrix to apply.
   * @return {Vector3} A reference to this vector.
   */
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
  /**
   * Applies the given Quaternion to this vector.
   *
   * @param {Quaternion} q - The Quaternion.
   * @return {Vector3} A reference to this vector.
   */
  applyQuaternion(q) {
    const vx = this.x, vy = this.y, vz = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    this.x = vx + qw * tx + qy * tz - qz * ty;
    this.y = vy + qw * ty + qz * tx - qx * tz;
    this.z = vz + qw * tz + qx * ty - qy * tx;
    return this;
  }
  /**
   * Projects this vector from world space into the camera's normalized
   * device coordinate (NDC) space.
   *
   * @param {Camera} camera - The camera.
   * @return {Vector3} A reference to this vector.
   */
  project(camera) {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  }
  /**
   * Unprojects this vector from the camera's normalized device coordinate (NDC)
   * space into world space.
   *
   * @param {Camera} camera - The camera.
   * @return {Vector3} A reference to this vector.
   */
  unproject(camera) {
    return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
  }
  /**
   * Transforms the direction of this vector by a matrix (the upper left 3 x 3
   * subset of the given 4x4 matrix and then normalizes the result.
   *
   * @param {Matrix4} m - The matrix.
   * @return {Vector3} A reference to this vector.
   */
  transformDirection(m) {
    const x = this.x, y = this.y, z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8] * z;
    this.y = e[1] * x + e[5] * y + e[9] * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;
    return this.normalize();
  }
  /**
   * Divides this instance by the given vector.
   *
   * @param {Vector3} v - The vector to divide.
   * @return {Vector3} A reference to this vector.
   */
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    return this;
  }
  /**
   * Divides this vector by the given scalar.
   *
   * @param {number} scalar - The scalar to divide.
   * @return {Vector3} A reference to this vector.
   */
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  /**
   * If this vector's x, y or z value is greater than the given vector's x, y or z
   * value, replace that value with the corresponding min value.
   *
   * @param {Vector3} v - The vector.
   * @return {Vector3} A reference to this vector.
   */
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }
  /**
   * If this vector's x, y or z value is less than the given vector's x, y or z
   * value, replace that value with the corresponding max value.
   *
   * @param {Vector3} v - The vector.
   * @return {Vector3} A reference to this vector.
   */
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }
  /**
   * If this vector's x, y or z value is greater than the max vector's x, y or z
   * value, it is replaced by the corresponding value.
   * If this vector's x, y or z value is less than the min vector's x, y or z value,
   * it is replaced by the corresponding value.
   *
   * @param {Vector3} min - The minimum x, y and z values.
   * @param {Vector3} max - The maximum x, y and z values in the desired range.
   * @return {Vector3} A reference to this vector.
   */
  clamp(min, max) {
    this.x = clamp(this.x, min.x, max.x);
    this.y = clamp(this.y, min.y, max.y);
    this.z = clamp(this.z, min.z, max.z);
    return this;
  }
  /**
   * If this vector's x, y or z values are greater than the max value, they are
   * replaced by the max value.
   * If this vector's x, y or z values are less than the min value, they are
   * replaced by the min value.
   *
   * @param {number} minVal - The minimum value the components will be clamped to.
   * @param {number} maxVal - The maximum value the components will be clamped to.
   * @return {Vector3} A reference to this vector.
   */
  clampScalar(minVal, maxVal) {
    this.x = clamp(this.x, minVal, maxVal);
    this.y = clamp(this.y, minVal, maxVal);
    this.z = clamp(this.z, minVal, maxVal);
    return this;
  }
  /**
   * If this vector's length is greater than the max value, it is replaced by
   * the max value.
   * If this vector's length is less than the min value, it is replaced by the
   * min value.
   *
   * @param {number} min - The minimum value the vector length will be clamped to.
   * @param {number} max - The maximum value the vector length will be clamped to.
   * @return {Vector3} A reference to this vector.
   */
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(clamp(length, min, max));
  }
  /**
   * The components of this vector are rounded down to the nearest integer value.
   *
   * @return {Vector3} A reference to this vector.
   */
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    return this;
  }
  /**
   * The components of this vector are rounded up to the nearest integer value.
   *
   * @return {Vector3} A reference to this vector.
   */
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    return this;
  }
  /**
   * The components of this vector are rounded to the nearest integer value
   *
   * @return {Vector3} A reference to this vector.
   */
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    return this;
  }
  /**
   * The components of this vector are rounded towards zero (up if negative,
   * down if positive) to an integer value.
   *
   * @return {Vector3} A reference to this vector.
   */
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    this.z = Math.trunc(this.z);
    return this;
  }
  /**
   * Inverts this vector - i.e. sets x = -x, y = -y and z = -z.
   *
   * @return {Vector3} A reference to this vector.
   */
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }
  /**
   * Calculates the dot product of the given vector with this instance.
   *
   * @param {Vector3} v - The vector to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  /**
   * Computes the square of the Euclidean length (straight-line length) from
   * (0, 0, 0) to (x, y, z). If you are comparing the lengths of vectors, you should
   * compare the length squared instead as it is slightly more efficient to calculate.
   *
   * @return {number} The square length of this vector.
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  /**
   * Computes the  Euclidean length (straight-line length) from (0, 0, 0) to (x, y, z).
   *
   * @return {number} The length of this vector.
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  /**
   * Computes the Manhattan length of this vector.
   *
   * @return {number} The length of this vector.
   */
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
  }
  /**
   * Converts this vector to a unit vector - that is, sets it equal to a vector
   * with the same direction as this one, but with a vector length of `1`.
   *
   * @return {Vector3} A reference to this vector.
   */
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  /**
   * Sets this vector to a vector with the same direction as this one, but
   * with the specified length.
   *
   * @param {number} length - The new length of this vector.
   * @return {Vector3} A reference to this vector.
   */
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  /**
   * Linearly interpolates between the given vector and this instance, where
   * alpha is the percent distance along the line - alpha = 0 will be this
   * vector, and alpha = 1 will be the given one.
   *
   * @param {Vector3} v - The vector to interpolate towards.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector3} A reference to this vector.
   */
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given vectors, where alpha is the percent
   * distance along the line - alpha = 0 will be first vector, and alpha = 1 will
   * be the second one. The result is stored in this instance.
   *
   * @param {Vector3} v1 - The first vector.
   * @param {Vector3} v2 - The second vector.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector3} A reference to this vector.
   */
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    return this;
  }
  /**
   * Calculates the cross product of the given vector with this instance.
   *
   * @param {Vector3} v - The vector to compute the cross product with.
   * @return {Vector3} The result of the cross product.
   */
  cross(v) {
    return this.crossVectors(this, v);
  }
  /**
   * Calculates the cross product of the given vectors and stores the result
   * in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  crossVectors(a, b) {
    const ax = a.x, ay = a.y, az = a.z;
    const bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }
  /**
   * Projects this vector onto the given one.
   *
   * @param {Vector3} v - The vector to project to.
   * @return {Vector3} A reference to this vector.
   */
  projectOnVector(v) {
    const denominator = v.lengthSq();
    if (denominator === 0) return this.set(0, 0, 0);
    const scalar = v.dot(this) / denominator;
    return this.copy(v).multiplyScalar(scalar);
  }
  /**
   * Projects this vector onto a plane by subtracting this
   * vector projected onto the plane's normal from this vector.
   *
   * @param {Vector3} planeNormal - The plane normal.
   * @return {Vector3} A reference to this vector.
   */
  projectOnPlane(planeNormal) {
    _vector$c.copy(this).projectOnVector(planeNormal);
    return this.sub(_vector$c);
  }
  /**
   * Reflects this vector off a plane orthogonal to the given normal vector.
   *
   * @param {Vector3} normal - The (normalized) normal vector.
   * @return {Vector3} A reference to this vector.
   */
  reflect(normal) {
    return this.sub(_vector$c.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }
  /**
   * Returns the angle between the given vector and this instance in radians.
   *
   * @param {Vector3} v - The vector to compute the angle with.
   * @return {number} The angle in radians.
   */
  angleTo(v) {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(clamp(theta, -1, 1));
  }
  /**
   * Computes the distance from the given vector to this instance.
   *
   * @param {Vector3} v - The vector to compute the distance to.
   * @return {number} The distance.
   */
  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v));
  }
  /**
   * Computes the squared distance from the given vector to this instance.
   * If you are just comparing the distance with another distance, you should compare
   * the distance squared instead as it is slightly more efficient to calculate.
   *
   * @param {Vector3} v - The vector to compute the squared distance to.
   * @return {number} The squared distance.
   */
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }
  /**
   * Computes the Manhattan distance from the given vector to this instance.
   *
   * @param {Vector3} v - The vector to compute the Manhattan distance to.
   * @return {number} The Manhattan distance.
   */
  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
  }
  /**
   * Sets the vector components from the given spherical coordinates.
   *
   * @param {Spherical} s - The spherical coordinates.
   * @return {Vector3} A reference to this vector.
   */
  setFromSpherical(s) {
    return this.setFromSphericalCoords(s.radius, s.phi, s.theta);
  }
  /**
   * Sets the vector components from the given spherical coordinates.
   *
   * @param {number} radius - The radius.
   * @param {number} phi - The phi angle in radians.
   * @param {number} theta - The theta angle in radians.
   * @return {Vector3} A reference to this vector.
   */
  setFromSphericalCoords(radius, phi, theta) {
    const sinPhiRadius = Math.sin(phi) * radius;
    this.x = sinPhiRadius * Math.sin(theta);
    this.y = Math.cos(phi) * radius;
    this.z = sinPhiRadius * Math.cos(theta);
    return this;
  }
  /**
   * Sets the vector components from the given cylindrical coordinates.
   *
   * @param {Cylindrical} c - The cylindrical coordinates.
   * @return {Vector3} A reference to this vector.
   */
  setFromCylindrical(c) {
    return this.setFromCylindricalCoords(c.radius, c.theta, c.y);
  }
  /**
   * Sets the vector components from the given cylindrical coordinates.
   *
   * @param {number} radius - The radius.
   * @param {number} theta - The theta angle in radians.
   * @param {number} y - The y value.
   * @return {Vector3} A reference to this vector.
   */
  setFromCylindricalCoords(radius, theta, y) {
    this.x = radius * Math.sin(theta);
    this.y = y;
    this.z = radius * Math.cos(theta);
    return this;
  }
  /**
   * Sets the vector components to the position elements of the
   * given transformation matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrixPosition(m) {
    const e = m.elements;
    this.x = e[12];
    this.y = e[13];
    this.z = e[14];
    return this;
  }
  /**
   * Sets the vector components to the scale elements of the
   * given transformation matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrixScale(m) {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    this.x = sx;
    this.y = sy;
    this.z = sz;
    return this;
  }
  /**
   * Sets the vector components from the specified matrix column.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @param {number} index - The column index.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrixColumn(m, index) {
    return this.fromArray(m.elements, index * 4);
  }
  /**
   * Sets the vector components from the specified matrix column.
   *
   * @param {Matrix3} m - The 3x3 matrix.
   * @param {number} index - The column index.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrix3Column(m, index) {
    return this.fromArray(m.elements, index * 3);
  }
  /**
   * Sets the vector components from the given Euler angles.
   *
   * @param {Euler} e - The Euler angles to set.
   * @return {Vector3} A reference to this vector.
   */
  setFromEuler(e) {
    this.x = e._x;
    this.y = e._y;
    this.z = e._z;
    return this;
  }
  /**
   * Sets the vector components from the RGB components of the
   * given color.
   *
   * @param {Color} c - The color to set.
   * @return {Vector3} A reference to this vector.
   */
  setFromColor(c) {
    this.x = c.r;
    this.y = c.g;
    this.z = c.b;
    return this;
  }
  /**
   * Returns `true` if this vector is equal with the given one.
   *
   * @param {Vector3} v - The vector to test for equality.
   * @return {boolean} Whether this vector is equal with the given one.
   */
  equals(v) {
    return v.x === this.x && v.y === this.y && v.z === this.z;
  }
  /**
   * Sets this vector's x value to be `array[ offset ]`, y value to be `array[ offset + 1 ]`
   * and z value to be `array[ offset + 2 ]`.
   *
   * @param {Array<number>} array - An array holding the vector component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Vector3} A reference to this vector.
   */
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }
  /**
   * Writes the components of this vector to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the vector components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The vector components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    return array;
  }
  /**
   * Sets the components of this vector from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding vector data.
   * @param {number} index - The index into the attribute.
   * @return {Vector3} A reference to this vector.
   */
  fromBufferAttribute(attribute, index) {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    return this;
  }
  /**
   * Sets each component of this vector to a pseudo-random value between `0` and
   * `1`, excluding `1`.
   *
   * @return {Vector3} A reference to this vector.
   */
  random() {
    this.x = Math.random();
    this.y = Math.random();
    this.z = Math.random();
    return this;
  }
  /**
   * Sets this vector to a uniformly random point on a unit sphere.
   *
   * @return {Vector3} A reference to this vector.
   */
  randomDirection() {
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const c = Math.sqrt(1 - u * u);
    this.x = c * Math.cos(theta);
    this.y = u;
    this.z = c * Math.sin(theta);
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
  }
};
var _vector$c = /* @__PURE__ */ new Vector3();
var _quaternion$4 = /* @__PURE__ */ new Quaternion();
var Matrix3 = class _Matrix3 {
  /**
   * Constructs a new 3x3 matrix. The arguments are supposed to be
   * in row-major order. If no arguments are provided, the constructor
   * initializes the matrix as an identity matrix.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   */
  constructor(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
    _Matrix3.prototype.isMatrix3 = true;
    this.elements = [
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1
    ];
    if (n11 !== void 0) {
      this.set(n11, n12, n13, n21, n22, n23, n31, n32, n33);
    }
  }
  /**
   * Sets the elements of the matrix.The arguments are supposed to be
   * in row-major order.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   * @return {Matrix3} A reference to this matrix.
   */
  set(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
    const te = this.elements;
    te[0] = n11;
    te[1] = n21;
    te[2] = n31;
    te[3] = n12;
    te[4] = n22;
    te[5] = n32;
    te[6] = n13;
    te[7] = n23;
    te[8] = n33;
    return this;
  }
  /**
   * Sets this matrix to the 3x3 identity matrix.
   *
   * @return {Matrix3} A reference to this matrix.
   */
  identity() {
    this.set(
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Copies the values of the given matrix to this instance.
   *
   * @param {Matrix3} m - The matrix to copy.
   * @return {Matrix3} A reference to this matrix.
   */
  copy(m) {
    const te = this.elements;
    const me = m.elements;
    te[0] = me[0];
    te[1] = me[1];
    te[2] = me[2];
    te[3] = me[3];
    te[4] = me[4];
    te[5] = me[5];
    te[6] = me[6];
    te[7] = me[7];
    te[8] = me[8];
    return this;
  }
  /**
   * Extracts the basis of this matrix into the three axis vectors provided.
   *
   * @param {Vector3} xAxis - The basis's x axis.
   * @param {Vector3} yAxis - The basis's y axis.
   * @param {Vector3} zAxis - The basis's z axis.
   * @return {Matrix3} A reference to this matrix.
   */
  extractBasis(xAxis, yAxis, zAxis) {
    xAxis.setFromMatrix3Column(this, 0);
    yAxis.setFromMatrix3Column(this, 1);
    zAxis.setFromMatrix3Column(this, 2);
    return this;
  }
  /**
   * Set this matrix to the upper 3x3 matrix of the given 4x4 matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Matrix3} A reference to this matrix.
   */
  setFromMatrix4(m) {
    const me = m.elements;
    this.set(
      me[0],
      me[4],
      me[8],
      me[1],
      me[5],
      me[9],
      me[2],
      me[6],
      me[10]
    );
    return this;
  }
  /**
   * Post-multiplies this matrix by the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix to multiply with.
   * @return {Matrix3} A reference to this matrix.
   */
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  /**
   * Pre-multiplies this matrix by the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix to multiply with.
   * @return {Matrix3} A reference to this matrix.
   */
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  /**
   * Multiples the given 3x3 matrices and stores the result
   * in this matrix.
   *
   * @param {Matrix3} a - The first matrix.
   * @param {Matrix3} b - The second matrix.
   * @return {Matrix3} A reference to this matrix.
   */
  multiplyMatrices(a, b) {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;
    const a11 = ae[0], a12 = ae[3], a13 = ae[6];
    const a21 = ae[1], a22 = ae[4], a23 = ae[7];
    const a31 = ae[2], a32 = ae[5], a33 = ae[8];
    const b11 = be[0], b12 = be[3], b13 = be[6];
    const b21 = be[1], b22 = be[4], b23 = be[7];
    const b31 = be[2], b32 = be[5], b33 = be[8];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31;
    te[3] = a11 * b12 + a12 * b22 + a13 * b32;
    te[6] = a11 * b13 + a12 * b23 + a13 * b33;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31;
    te[4] = a21 * b12 + a22 * b22 + a23 * b32;
    te[7] = a21 * b13 + a22 * b23 + a23 * b33;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31;
    te[5] = a31 * b12 + a32 * b22 + a33 * b32;
    te[8] = a31 * b13 + a32 * b23 + a33 * b33;
    return this;
  }
  /**
   * Multiplies every component of the matrix by the given scalar.
   *
   * @param {number} s - The scalar.
   * @return {Matrix3} A reference to this matrix.
   */
  multiplyScalar(s) {
    const te = this.elements;
    te[0] *= s;
    te[3] *= s;
    te[6] *= s;
    te[1] *= s;
    te[4] *= s;
    te[7] *= s;
    te[2] *= s;
    te[5] *= s;
    te[8] *= s;
    return this;
  }
  /**
   * Computes and returns the determinant of this matrix.
   *
   * @return {number} The determinant.
   */
  determinant() {
    const te = this.elements;
    const a = te[0], b = te[1], c = te[2], d = te[3], e = te[4], f = te[5], g = te[6], h = te[7], i = te[8];
    return a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g;
  }
  /**
   * Inverts this matrix, using the [analytic method](https://en.wikipedia.org/wiki/Invertible_matrix#Analytic_solution).
   * You can not invert with a determinant of zero. If you attempt this, the method produces
   * a zero matrix instead.
   *
   * @return {Matrix3} A reference to this matrix.
   */
  invert() {
    const te = this.elements, n11 = te[0], n21 = te[1], n31 = te[2], n12 = te[3], n22 = te[4], n32 = te[5], n13 = te[6], n23 = te[7], n33 = te[8], t11 = n33 * n22 - n32 * n23, t12 = n32 * n13 - n33 * n12, t13 = n23 * n12 - n22 * n13, det = n11 * t11 + n21 * t12 + n31 * t13;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const detInv = 1 / det;
    te[0] = t11 * detInv;
    te[1] = (n31 * n23 - n33 * n21) * detInv;
    te[2] = (n32 * n21 - n31 * n22) * detInv;
    te[3] = t12 * detInv;
    te[4] = (n33 * n11 - n31 * n13) * detInv;
    te[5] = (n31 * n12 - n32 * n11) * detInv;
    te[6] = t13 * detInv;
    te[7] = (n21 * n13 - n23 * n11) * detInv;
    te[8] = (n22 * n11 - n21 * n12) * detInv;
    return this;
  }
  /**
   * Transposes this matrix in place.
   *
   * @return {Matrix3} A reference to this matrix.
   */
  transpose() {
    let tmp;
    const m = this.elements;
    tmp = m[1];
    m[1] = m[3];
    m[3] = tmp;
    tmp = m[2];
    m[2] = m[6];
    m[6] = tmp;
    tmp = m[5];
    m[5] = m[7];
    m[7] = tmp;
    return this;
  }
  /**
   * Computes the normal matrix which is the inverse transpose of the upper
   * left 3x3 portion of the given 4x4 matrix.
   *
   * @param {Matrix4} matrix4 - The 4x4 matrix.
   * @return {Matrix3} A reference to this matrix.
   */
  getNormalMatrix(matrix4) {
    return this.setFromMatrix4(matrix4).invert().transpose();
  }
  /**
   * Transposes this matrix into the supplied array, and returns itself unchanged.
   *
   * @param {Array<number>} r - An array to store the transposed matrix elements.
   * @return {Matrix3} A reference to this matrix.
   */
  transposeIntoArray(r) {
    const m = this.elements;
    r[0] = m[0];
    r[1] = m[3];
    r[2] = m[6];
    r[3] = m[1];
    r[4] = m[4];
    r[5] = m[7];
    r[6] = m[2];
    r[7] = m[5];
    r[8] = m[8];
    return this;
  }
  /**
   * Sets the UV transform matrix from offset, repeat, rotation, and center.
   *
   * @param {number} tx - Offset x.
   * @param {number} ty - Offset y.
   * @param {number} sx - Repeat x.
   * @param {number} sy - Repeat y.
   * @param {number} rotation - Rotation, in radians. Positive values rotate counterclockwise.
   * @param {number} cx - Center x of rotation.
   * @param {number} cy - Center y of rotation
   * @return {Matrix3} A reference to this matrix.
   */
  setUvTransform(tx, ty, sx, sy, rotation, cx, cy) {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    this.set(
      sx * c,
      sx * s,
      -sx * (c * cx + s * cy) + cx + tx,
      -sy * s,
      sy * c,
      -sy * (-s * cx + c * cy) + cy + ty,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Scales this matrix with the given scalar values.
   *
   * @param {number} sx - The amount to scale in the X axis.
   * @param {number} sy - The amount to scale in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  scale(sx, sy) {
    this.premultiply(_m3.makeScale(sx, sy));
    return this;
  }
  /**
   * Rotates this matrix by the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix3} A reference to this matrix.
   */
  rotate(theta) {
    this.premultiply(_m3.makeRotation(-theta));
    return this;
  }
  /**
   * Translates this matrix by the given scalar values.
   *
   * @param {number} tx - The amount to translate in the X axis.
   * @param {number} ty - The amount to translate in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  translate(tx, ty) {
    this.premultiply(_m3.makeTranslation(tx, ty));
    return this;
  }
  // for 2D Transforms
  /**
   * Sets this matrix as a 2D translation transform.
   *
   * @param {number|Vector2} x - The amount to translate in the X axis or alternatively a translation vector.
   * @param {number} y - The amount to translate in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  makeTranslation(x, y) {
    if (x.isVector2) {
      this.set(
        1,
        0,
        x.x,
        0,
        1,
        x.y,
        0,
        0,
        1
      );
    } else {
      this.set(
        1,
        0,
        x,
        0,
        1,
        y,
        0,
        0,
        1
      );
    }
    return this;
  }
  /**
   * Sets this matrix as a 2D rotational transformation.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix3} A reference to this matrix.
   */
  makeRotation(theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    this.set(
      c,
      -s,
      0,
      s,
      c,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a 2D scale transform.
   *
   * @param {number} x - The amount to scale in the X axis.
   * @param {number} y - The amount to scale in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  makeScale(x, y) {
    this.set(
      x,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Returns `true` if this matrix is equal with the given one.
   *
   * @param {Matrix3} matrix - The matrix to test for equality.
   * @return {boolean} Whether this matrix is equal with the given one.
   */
  equals(matrix) {
    const te = this.elements;
    const me = matrix.elements;
    for (let i = 0; i < 9; i++) {
      if (te[i] !== me[i]) return false;
    }
    return true;
  }
  /**
   * Sets the elements of the matrix from the given array.
   *
   * @param {Array<number>} array - The matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Matrix3} A reference to this matrix.
   */
  fromArray(array, offset = 0) {
    for (let i = 0; i < 9; i++) {
      this.elements[i] = array[i + offset];
    }
    return this;
  }
  /**
   * Writes the elements of this matrix to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The matrix elements in column-major order.
   */
  toArray(array = [], offset = 0) {
    const te = this.elements;
    array[offset] = te[0];
    array[offset + 1] = te[1];
    array[offset + 2] = te[2];
    array[offset + 3] = te[3];
    array[offset + 4] = te[4];
    array[offset + 5] = te[5];
    array[offset + 6] = te[6];
    array[offset + 7] = te[7];
    array[offset + 8] = te[8];
    return array;
  }
  /**
   * Returns a matrix with copied values from this instance.
   *
   * @return {Matrix3} A clone of this instance.
   */
  clone() {
    return new this.constructor().fromArray(this.elements);
  }
};
var _m3 = /* @__PURE__ */ new Matrix3();
var LINEAR_REC709_TO_XYZ = /* @__PURE__ */ new Matrix3().set(
  0.4123908,
  0.3575843,
  0.1804808,
  0.212639,
  0.7151687,
  0.0721923,
  0.0193308,
  0.1191948,
  0.9505322
);
var XYZ_TO_LINEAR_REC709 = /* @__PURE__ */ new Matrix3().set(
  3.2409699,
  -1.5373832,
  -0.4986108,
  -0.9692436,
  1.8759675,
  0.0415551,
  0.0556301,
  -0.203977,
  1.0569715
);
function createColorManagement() {
  const ColorManagement2 = {
    enabled: true,
    workingColorSpace: LinearSRGBColorSpace,
    /**
     * Implementations of supported color spaces.
     *
     * Required:
     *	- primaries: chromaticity coordinates [ rx ry gx gy bx by ]
     *	- whitePoint: reference white [ x y ]
     *	- transfer: transfer function (pre-defined)
     *	- toXYZ: Matrix3 RGB to XYZ transform
     *	- fromXYZ: Matrix3 XYZ to RGB transform
     *	- luminanceCoefficients: RGB luminance coefficients
     *
     * Optional:
     *  - outputColorSpaceConfig: { drawingBufferColorSpace: ColorSpace, toneMappingMode: 'extended' | 'standard' }
     *  - workingColorSpaceConfig: { unpackColorSpace: ColorSpace }
     *
     * Reference:
     * - https://www.russellcottrell.com/photo/matrixCalculator.htm
     */
    spaces: {},
    convert: function(color, sourceColorSpace, targetColorSpace) {
      if (this.enabled === false || sourceColorSpace === targetColorSpace || !sourceColorSpace || !targetColorSpace) {
        return color;
      }
      if (this.spaces[sourceColorSpace].transfer === SRGBTransfer) {
        color.r = SRGBToLinear(color.r);
        color.g = SRGBToLinear(color.g);
        color.b = SRGBToLinear(color.b);
      }
      if (this.spaces[sourceColorSpace].primaries !== this.spaces[targetColorSpace].primaries) {
        color.applyMatrix3(this.spaces[sourceColorSpace].toXYZ);
        color.applyMatrix3(this.spaces[targetColorSpace].fromXYZ);
      }
      if (this.spaces[targetColorSpace].transfer === SRGBTransfer) {
        color.r = LinearToSRGB(color.r);
        color.g = LinearToSRGB(color.g);
        color.b = LinearToSRGB(color.b);
      }
      return color;
    },
    workingToColorSpace: function(color, targetColorSpace) {
      return this.convert(color, this.workingColorSpace, targetColorSpace);
    },
    colorSpaceToWorking: function(color, sourceColorSpace) {
      return this.convert(color, sourceColorSpace, this.workingColorSpace);
    },
    getPrimaries: function(colorSpace) {
      return this.spaces[colorSpace].primaries;
    },
    getTransfer: function(colorSpace) {
      if (colorSpace === NoColorSpace) return LinearTransfer;
      return this.spaces[colorSpace].transfer;
    },
    getToneMappingMode: function(colorSpace) {
      return this.spaces[colorSpace].outputColorSpaceConfig.toneMappingMode || "standard";
    },
    getLuminanceCoefficients: function(target, colorSpace = this.workingColorSpace) {
      return target.fromArray(this.spaces[colorSpace].luminanceCoefficients);
    },
    define: function(colorSpaces) {
      Object.assign(this.spaces, colorSpaces);
    },
    // Internal APIs
    _getMatrix: function(targetMatrix, sourceColorSpace, targetColorSpace) {
      return targetMatrix.copy(this.spaces[sourceColorSpace].toXYZ).multiply(this.spaces[targetColorSpace].fromXYZ);
    },
    _getDrawingBufferColorSpace: function(colorSpace) {
      return this.spaces[colorSpace].outputColorSpaceConfig.drawingBufferColorSpace;
    },
    _getUnpackColorSpace: function(colorSpace = this.workingColorSpace) {
      return this.spaces[colorSpace].workingColorSpaceConfig.unpackColorSpace;
    },
    // Deprecated
    fromWorkingColorSpace: function(color, targetColorSpace) {
      warnOnce("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace().");
      return ColorManagement2.workingToColorSpace(color, targetColorSpace);
    },
    toWorkingColorSpace: function(color, sourceColorSpace) {
      warnOnce("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking().");
      return ColorManagement2.colorSpaceToWorking(color, sourceColorSpace);
    }
  };
  const REC709_PRIMARIES = [0.64, 0.33, 0.3, 0.6, 0.15, 0.06];
  const REC709_LUMINANCE_COEFFICIENTS = [0.2126, 0.7152, 0.0722];
  const D65 = [0.3127, 0.329];
  ColorManagement2.define({
    [LinearSRGBColorSpace]: {
      primaries: REC709_PRIMARIES,
      whitePoint: D65,
      transfer: LinearTransfer,
      toXYZ: LINEAR_REC709_TO_XYZ,
      fromXYZ: XYZ_TO_LINEAR_REC709,
      luminanceCoefficients: REC709_LUMINANCE_COEFFICIENTS,
      workingColorSpaceConfig: { unpackColorSpace: SRGBColorSpace },
      outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace }
    },
    [SRGBColorSpace]: {
      primaries: REC709_PRIMARIES,
      whitePoint: D65,
      transfer: SRGBTransfer,
      toXYZ: LINEAR_REC709_TO_XYZ,
      fromXYZ: XYZ_TO_LINEAR_REC709,
      luminanceCoefficients: REC709_LUMINANCE_COEFFICIENTS,
      outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace }
    }
  });
  return ColorManagement2;
}
var ColorManagement = /* @__PURE__ */ createColorManagement();
function SRGBToLinear(c) {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}
function LinearToSRGB(c) {
  return c < 31308e-7 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055;
}
var _canvas;
var ImageUtils = class {
  /**
   * Returns a data URI containing a representation of the given image.
   *
   * @param {(HTMLImageElement|HTMLCanvasElement)} image - The image object.
   * @param {string} [type='image/png'] - Indicates the image format.
   * @return {string} The data URI.
   */
  static getDataURL(image, type = "image/png") {
    if (/^data:/i.test(image.src)) {
      return image.src;
    }
    if (typeof HTMLCanvasElement === "undefined") {
      return image.src;
    }
    let canvas;
    if (image instanceof HTMLCanvasElement) {
      canvas = image;
    } else {
      if (_canvas === void 0) _canvas = createElementNS("canvas");
      _canvas.width = image.width;
      _canvas.height = image.height;
      const context = _canvas.getContext("2d");
      if (image instanceof ImageData) {
        context.putImageData(image, 0, 0);
      } else {
        context.drawImage(image, 0, 0, image.width, image.height);
      }
      canvas = _canvas;
    }
    return canvas.toDataURL(type);
  }
  /**
   * Converts the given sRGB image data to linear color space.
   *
   * @param {(HTMLImageElement|HTMLCanvasElement|ImageBitmap|Object)} image - The image object.
   * @return {HTMLCanvasElement|Object} The converted image.
   */
  static sRGBToLinear(image) {
    if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement || typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement || typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      const canvas = createElementNS("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, image.width, image.height);
      const imageData = context.getImageData(0, 0, image.width, image.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i++) {
        data[i] = SRGBToLinear(data[i] / 255) * 255;
      }
      context.putImageData(imageData, 0, 0);
      return canvas;
    } else if (image.data) {
      const data = image.data.slice(0);
      for (let i = 0; i < data.length; i++) {
        if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
          data[i] = Math.floor(SRGBToLinear(data[i] / 255) * 255);
        } else {
          data[i] = SRGBToLinear(data[i]);
        }
      }
      return {
        data,
        width: image.width,
        height: image.height
      };
    } else {
      warn("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.");
      return image;
    }
  }
};
var _sourceId = 0;
var Source = class {
  /**
   * Constructs a new video texture.
   *
   * @param {any} [data=null] - The data definition of a texture.
   */
  constructor(data = null) {
    this.isSource = true;
    Object.defineProperty(this, "id", { value: _sourceId++ });
    this.uuid = generateUUID();
    this.data = data;
    this.dataReady = true;
    this.version = 0;
  }
  /**
   * Returns the dimensions of the source into the given target vector.
   *
   * @param {(Vector2|Vector3)} target - The target object the result is written into.
   * @return {(Vector2|Vector3)} The dimensions of the source.
   */
  getSize(target) {
    const data = this.data;
    if (typeof HTMLVideoElement !== "undefined" && data instanceof HTMLVideoElement) {
      target.set(data.videoWidth, data.videoHeight, 0);
    } else if (typeof VideoFrame !== "undefined" && data instanceof VideoFrame) {
      target.set(data.displayHeight, data.displayWidth, 0);
    } else if (data !== null) {
      target.set(data.width, data.height, data.depth || 0);
    } else {
      target.set(0, 0, 0);
    }
    return target;
  }
  /**
   * When the property is set to `true`, the engine allocates the memory
   * for the texture (if necessary) and triggers the actual texture upload
   * to the GPU next time the source is used.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsUpdate(value) {
    if (value === true) this.version++;
  }
  /**
   * Serializes the source into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized source.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (!isRootObject && meta.images[this.uuid] !== void 0) {
      return meta.images[this.uuid];
    }
    const output = {
      uuid: this.uuid,
      url: ""
    };
    const data = this.data;
    if (data !== null) {
      let url;
      if (Array.isArray(data)) {
        url = [];
        for (let i = 0, l = data.length; i < l; i++) {
          if (data[i].isDataTexture) {
            url.push(serializeImage(data[i].image));
          } else {
            url.push(serializeImage(data[i]));
          }
        }
      } else {
        url = serializeImage(data);
      }
      output.url = url;
    }
    if (!isRootObject) {
      meta.images[this.uuid] = output;
    }
    return output;
  }
};
function serializeImage(image) {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement || typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement || typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return ImageUtils.getDataURL(image);
  } else {
    if (image.data) {
      return {
        data: Array.from(image.data),
        width: image.width,
        height: image.height,
        type: image.data.constructor.name
      };
    } else {
      warn("Texture: Unable to serialize Texture.");
      return {};
    }
  }
}
var _textureId = 0;
var _tempVec3 = /* @__PURE__ */ new Vector3();
var Texture = class _Texture extends EventDispatcher {
  /**
   * Constructs a new texture.
   *
   * @param {?Object} [image=Texture.DEFAULT_IMAGE] - The image holding the texture data.
   * @param {number} [mapping=Texture.DEFAULT_MAPPING] - The texture mapping.
   * @param {number} [wrapS=ClampToEdgeWrapping] - The wrapS value.
   * @param {number} [wrapT=ClampToEdgeWrapping] - The wrapT value.
   * @param {number} [magFilter=LinearFilter] - The mag filter value.
   * @param {number} [minFilter=LinearMipmapLinearFilter] - The min filter value.
   * @param {number} [format=RGBAFormat] - The texture format.
   * @param {number} [type=UnsignedByteType] - The texture type.
   * @param {number} [anisotropy=Texture.DEFAULT_ANISOTROPY] - The anisotropy value.
   * @param {string} [colorSpace=NoColorSpace] - The color space.
   */
  constructor(image = _Texture.DEFAULT_IMAGE, mapping = _Texture.DEFAULT_MAPPING, wrapS = ClampToEdgeWrapping, wrapT = ClampToEdgeWrapping, magFilter = LinearFilter, minFilter = LinearMipmapLinearFilter, format = RGBAFormat, type = UnsignedByteType, anisotropy = _Texture.DEFAULT_ANISOTROPY, colorSpace = NoColorSpace) {
    super();
    this.isTexture = true;
    Object.defineProperty(this, "id", { value: _textureId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.source = new Source(image);
    this.mipmaps = [];
    this.mapping = mapping;
    this.channel = 0;
    this.wrapS = wrapS;
    this.wrapT = wrapT;
    this.magFilter = magFilter;
    this.minFilter = minFilter;
    this.anisotropy = anisotropy;
    this.format = format;
    this.internalFormat = null;
    this.type = type;
    this.offset = new Vector2(0, 0);
    this.repeat = new Vector2(1, 1);
    this.center = new Vector2(0, 0);
    this.rotation = 0;
    this.matrixAutoUpdate = true;
    this.matrix = new Matrix3();
    this.generateMipmaps = true;
    this.premultiplyAlpha = false;
    this.flipY = true;
    this.unpackAlignment = 4;
    this.colorSpace = colorSpace;
    this.userData = {};
    this.updateRanges = [];
    this.version = 0;
    this.onUpdate = null;
    this.renderTarget = null;
    this.isRenderTargetTexture = false;
    this.isArrayTexture = image && image.depth && image.depth > 1 ? true : false;
    this.pmremVersion = 0;
  }
  /**
   * The width of the texture in pixels.
   */
  get width() {
    return this.source.getSize(_tempVec3).x;
  }
  /**
   * The height of the texture in pixels.
   */
  get height() {
    return this.source.getSize(_tempVec3).y;
  }
  /**
   * The depth of the texture in pixels.
   */
  get depth() {
    return this.source.getSize(_tempVec3).z;
  }
  /**
   * The image object holding the texture data.
   *
   * @type {?Object}
   */
  get image() {
    return this.source.data;
  }
  set image(value = null) {
    this.source.data = value;
  }
  /**
   * Updates the texture transformation matrix from the from the properties {@link Texture#offset},
   * {@link Texture#repeat}, {@link Texture#rotation}, and {@link Texture#center}.
   */
  updateMatrix() {
    this.matrix.setUvTransform(this.offset.x, this.offset.y, this.repeat.x, this.repeat.y, this.rotation, this.center.x, this.center.y);
  }
  /**
   * Adds a range of data in the data texture to be updated on the GPU.
   *
   * @param {number} start - Position at which to start update.
   * @param {number} count - The number of components to update.
   */
  addUpdateRange(start, count) {
    this.updateRanges.push({ start, count });
  }
  /**
   * Clears the update ranges.
   */
  clearUpdateRanges() {
    this.updateRanges.length = 0;
  }
  /**
   * Returns a new texture with copied values from this instance.
   *
   * @return {Texture} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Copies the values of the given texture to this instance.
   *
   * @param {Texture} source - The texture to copy.
   * @return {Texture} A reference to this instance.
   */
  copy(source) {
    this.name = source.name;
    this.source = source.source;
    this.mipmaps = source.mipmaps.slice(0);
    this.mapping = source.mapping;
    this.channel = source.channel;
    this.wrapS = source.wrapS;
    this.wrapT = source.wrapT;
    this.magFilter = source.magFilter;
    this.minFilter = source.minFilter;
    this.anisotropy = source.anisotropy;
    this.format = source.format;
    this.internalFormat = source.internalFormat;
    this.type = source.type;
    this.offset.copy(source.offset);
    this.repeat.copy(source.repeat);
    this.center.copy(source.center);
    this.rotation = source.rotation;
    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrix.copy(source.matrix);
    this.generateMipmaps = source.generateMipmaps;
    this.premultiplyAlpha = source.premultiplyAlpha;
    this.flipY = source.flipY;
    this.unpackAlignment = source.unpackAlignment;
    this.colorSpace = source.colorSpace;
    this.renderTarget = source.renderTarget;
    this.isRenderTargetTexture = source.isRenderTargetTexture;
    this.isArrayTexture = source.isArrayTexture;
    this.userData = JSON.parse(JSON.stringify(source.userData));
    this.needsUpdate = true;
    return this;
  }
  /**
   * Sets this texture's properties based on `values`.
   * @param {Object} values - A container with texture parameters.
   */
  setValues(values) {
    for (const key in values) {
      const newValue = values[key];
      if (newValue === void 0) {
        warn(`Texture.setValues(): parameter '${key}' has value of undefined.`);
        continue;
      }
      const currentValue = this[key];
      if (currentValue === void 0) {
        warn(`Texture.setValues(): property '${key}' does not exist.`);
        continue;
      }
      if (currentValue && newValue && (currentValue.isVector2 && newValue.isVector2)) {
        currentValue.copy(newValue);
      } else if (currentValue && newValue && (currentValue.isVector3 && newValue.isVector3)) {
        currentValue.copy(newValue);
      } else if (currentValue && newValue && (currentValue.isMatrix3 && newValue.isMatrix3)) {
        currentValue.copy(newValue);
      } else {
        this[key] = newValue;
      }
    }
  }
  /**
   * Serializes the texture into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized texture.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (!isRootObject && meta.textures[this.uuid] !== void 0) {
      return meta.textures[this.uuid];
    }
    const output = {
      metadata: {
        version: 4.7,
        type: "Texture",
        generator: "Texture.toJSON"
      },
      uuid: this.uuid,
      name: this.name,
      image: this.source.toJSON(meta).uuid,
      mapping: this.mapping,
      channel: this.channel,
      repeat: [this.repeat.x, this.repeat.y],
      offset: [this.offset.x, this.offset.y],
      center: [this.center.x, this.center.y],
      rotation: this.rotation,
      wrap: [this.wrapS, this.wrapT],
      format: this.format,
      internalFormat: this.internalFormat,
      type: this.type,
      colorSpace: this.colorSpace,
      minFilter: this.minFilter,
      magFilter: this.magFilter,
      anisotropy: this.anisotropy,
      flipY: this.flipY,
      generateMipmaps: this.generateMipmaps,
      premultiplyAlpha: this.premultiplyAlpha,
      unpackAlignment: this.unpackAlignment
    };
    if (Object.keys(this.userData).length > 0) output.userData = this.userData;
    if (!isRootObject) {
      meta.textures[this.uuid] = output;
    }
    return output;
  }
  /**
   * Frees the GPU-related resources allocated by this instance. Call this
   * method whenever this instance is no longer used in your app.
   *
   * @fires Texture#dispose
   */
  dispose() {
    this.dispatchEvent({ type: "dispose" });
  }
  /**
   * Transforms the given uv vector with the textures uv transformation matrix.
   *
   * @param {Vector2} uv - The uv vector.
   * @return {Vector2} The transformed uv vector.
   */
  transformUv(uv) {
    if (this.mapping !== UVMapping) return uv;
    uv.applyMatrix3(this.matrix);
    if (uv.x < 0 || uv.x > 1) {
      switch (this.wrapS) {
        case RepeatWrapping:
          uv.x = uv.x - Math.floor(uv.x);
          break;
        case ClampToEdgeWrapping:
          uv.x = uv.x < 0 ? 0 : 1;
          break;
        case MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.x) % 2) === 1) {
            uv.x = Math.ceil(uv.x) - uv.x;
          } else {
            uv.x = uv.x - Math.floor(uv.x);
          }
          break;
      }
    }
    if (uv.y < 0 || uv.y > 1) {
      switch (this.wrapT) {
        case RepeatWrapping:
          uv.y = uv.y - Math.floor(uv.y);
          break;
        case ClampToEdgeWrapping:
          uv.y = uv.y < 0 ? 0 : 1;
          break;
        case MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.y) % 2) === 1) {
            uv.y = Math.ceil(uv.y) - uv.y;
          } else {
            uv.y = uv.y - Math.floor(uv.y);
          }
          break;
      }
    }
    if (this.flipY) {
      uv.y = 1 - uv.y;
    }
    return uv;
  }
  /**
   * Setting this property to `true` indicates the engine the texture
   * must be updated in the next render. This triggers a texture upload
   * to the GPU and ensures correct texture parameter configuration.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsUpdate(value) {
    if (value === true) {
      this.version++;
      this.source.needsUpdate = true;
    }
  }
  /**
   * Setting this property to `true` indicates the engine the PMREM
   * must be regenerated.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsPMREMUpdate(value) {
    if (value === true) {
      this.pmremVersion++;
    }
  }
};
Texture.DEFAULT_IMAGE = null;
Texture.DEFAULT_MAPPING = UVMapping;
Texture.DEFAULT_ANISOTROPY = 1;
var Matrix4 = class _Matrix4 {
  /**
   * Constructs a new 4x4 matrix. The arguments are supposed to be
   * in row-major order. If no arguments are provided, the constructor
   * initializes the matrix as an identity matrix.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n14] - 1-4 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n24] - 2-4 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   * @param {number} [n34] - 3-4 matrix element.
   * @param {number} [n41] - 4-1 matrix element.
   * @param {number} [n42] - 4-2 matrix element.
   * @param {number} [n43] - 4-3 matrix element.
   * @param {number} [n44] - 4-4 matrix element.
   */
  constructor(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    _Matrix4.prototype.isMatrix4 = true;
    this.elements = [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    ];
    if (n11 !== void 0) {
      this.set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44);
    }
  }
  /**
   * Sets the elements of the matrix.The arguments are supposed to be
   * in row-major order.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n14] - 1-4 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n24] - 2-4 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   * @param {number} [n34] - 3-4 matrix element.
   * @param {number} [n41] - 4-1 matrix element.
   * @param {number} [n42] - 4-2 matrix element.
   * @param {number} [n43] - 4-3 matrix element.
   * @param {number} [n44] - 4-4 matrix element.
   * @return {Matrix4} A reference to this matrix.
   */
  set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    const te = this.elements;
    te[0] = n11;
    te[4] = n12;
    te[8] = n13;
    te[12] = n14;
    te[1] = n21;
    te[5] = n22;
    te[9] = n23;
    te[13] = n24;
    te[2] = n31;
    te[6] = n32;
    te[10] = n33;
    te[14] = n34;
    te[3] = n41;
    te[7] = n42;
    te[11] = n43;
    te[15] = n44;
    return this;
  }
  /**
   * Sets this matrix to the 4x4 identity matrix.
   *
   * @return {Matrix4} A reference to this matrix.
   */
  identity() {
    this.set(
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Returns a matrix with copied values from this instance.
   *
   * @return {Matrix4} A clone of this instance.
   */
  clone() {
    return new _Matrix4().fromArray(this.elements);
  }
  /**
   * Copies the values of the given matrix to this instance.
   *
   * @param {Matrix4} m - The matrix to copy.
   * @return {Matrix4} A reference to this matrix.
   */
  copy(m) {
    const te = this.elements;
    const me = m.elements;
    te[0] = me[0];
    te[1] = me[1];
    te[2] = me[2];
    te[3] = me[3];
    te[4] = me[4];
    te[5] = me[5];
    te[6] = me[6];
    te[7] = me[7];
    te[8] = me[8];
    te[9] = me[9];
    te[10] = me[10];
    te[11] = me[11];
    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];
    te[15] = me[15];
    return this;
  }
  /**
   * Copies the translation component of the given matrix
   * into this matrix's translation component.
   *
   * @param {Matrix4} m - The matrix to copy the translation component.
   * @return {Matrix4} A reference to this matrix.
   */
  copyPosition(m) {
    const te = this.elements, me = m.elements;
    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];
    return this;
  }
  /**
   * Set the upper 3x3 elements of this matrix to the values of given 3x3 matrix.
   *
   * @param {Matrix3} m - The 3x3 matrix.
   * @return {Matrix4} A reference to this matrix.
   */
  setFromMatrix3(m) {
    const me = m.elements;
    this.set(
      me[0],
      me[3],
      me[6],
      0,
      me[1],
      me[4],
      me[7],
      0,
      me[2],
      me[5],
      me[8],
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Extracts the basis of this matrix into the three axis vectors provided.
   *
   * @param {Vector3} xAxis - The basis's x axis.
   * @param {Vector3} yAxis - The basis's y axis.
   * @param {Vector3} zAxis - The basis's z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  extractBasis(xAxis, yAxis, zAxis) {
    if (this.determinant() === 0) {
      xAxis.set(1, 0, 0);
      yAxis.set(0, 1, 0);
      zAxis.set(0, 0, 1);
      return this;
    }
    xAxis.setFromMatrixColumn(this, 0);
    yAxis.setFromMatrixColumn(this, 1);
    zAxis.setFromMatrixColumn(this, 2);
    return this;
  }
  /**
   * Sets the given basis vectors to this matrix.
   *
   * @param {Vector3} xAxis - The basis's x axis.
   * @param {Vector3} yAxis - The basis's y axis.
   * @param {Vector3} zAxis - The basis's z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  makeBasis(xAxis, yAxis, zAxis) {
    this.set(
      xAxis.x,
      yAxis.x,
      zAxis.x,
      0,
      xAxis.y,
      yAxis.y,
      zAxis.y,
      0,
      xAxis.z,
      yAxis.z,
      zAxis.z,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Extracts the rotation component of the given matrix
   * into this matrix's rotation component.
   *
   * Note: This method does not support reflection matrices.
   *
   * @param {Matrix4} m - The matrix.
   * @return {Matrix4} A reference to this matrix.
   */
  extractRotation(m) {
    if (m.determinant() === 0) {
      return this.identity();
    }
    const te = this.elements;
    const me = m.elements;
    const scaleX = 1 / _v1$5.setFromMatrixColumn(m, 0).length();
    const scaleY = 1 / _v1$5.setFromMatrixColumn(m, 1).length();
    const scaleZ = 1 / _v1$5.setFromMatrixColumn(m, 2).length();
    te[0] = me[0] * scaleX;
    te[1] = me[1] * scaleX;
    te[2] = me[2] * scaleX;
    te[3] = 0;
    te[4] = me[4] * scaleY;
    te[5] = me[5] * scaleY;
    te[6] = me[6] * scaleY;
    te[7] = 0;
    te[8] = me[8] * scaleZ;
    te[9] = me[9] * scaleZ;
    te[10] = me[10] * scaleZ;
    te[11] = 0;
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }
  /**
   * Sets the rotation component (the upper left 3x3 matrix) of this matrix to
   * the rotation specified by the given Euler angles. The rest of
   * the matrix is set to the identity. Depending on the {@link Euler#order},
   * there are six possible outcomes. See [this page](https://en.wikipedia.org/wiki/Euler_angles#Rotation_matrix)
   * for a complete list.
   *
   * @param {Euler} euler - The Euler angles.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationFromEuler(euler) {
    const te = this.elements;
    const x = euler.x, y = euler.y, z = euler.z;
    const a = Math.cos(x), b = Math.sin(x);
    const c = Math.cos(y), d = Math.sin(y);
    const e = Math.cos(z), f = Math.sin(z);
    if (euler.order === "XYZ") {
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      te[0] = c * e;
      te[4] = -c * f;
      te[8] = d;
      te[1] = af + be * d;
      te[5] = ae - bf * d;
      te[9] = -b * c;
      te[2] = bf - ae * d;
      te[6] = be + af * d;
      te[10] = a * c;
    } else if (euler.order === "YXZ") {
      const ce = c * e, cf = c * f, de = d * e, df = d * f;
      te[0] = ce + df * b;
      te[4] = de * b - cf;
      te[8] = a * d;
      te[1] = a * f;
      te[5] = a * e;
      te[9] = -b;
      te[2] = cf * b - de;
      te[6] = df + ce * b;
      te[10] = a * c;
    } else if (euler.order === "ZXY") {
      const ce = c * e, cf = c * f, de = d * e, df = d * f;
      te[0] = ce - df * b;
      te[4] = -a * f;
      te[8] = de + cf * b;
      te[1] = cf + de * b;
      te[5] = a * e;
      te[9] = df - ce * b;
      te[2] = -a * d;
      te[6] = b;
      te[10] = a * c;
    } else if (euler.order === "ZYX") {
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      te[0] = c * e;
      te[4] = be * d - af;
      te[8] = ae * d + bf;
      te[1] = c * f;
      te[5] = bf * d + ae;
      te[9] = af * d - be;
      te[2] = -d;
      te[6] = b * c;
      te[10] = a * c;
    } else if (euler.order === "YZX") {
      const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
      te[0] = c * e;
      te[4] = bd - ac * f;
      te[8] = bc * f + ad;
      te[1] = f;
      te[5] = a * e;
      te[9] = -b * e;
      te[2] = -d * e;
      te[6] = ad * f + bc;
      te[10] = ac - bd * f;
    } else if (euler.order === "XZY") {
      const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
      te[0] = c * e;
      te[4] = -f;
      te[8] = d * e;
      te[1] = ac * f + bd;
      te[5] = a * e;
      te[9] = ad * f - bc;
      te[2] = bc * f - ad;
      te[6] = b * e;
      te[10] = bd * f + ac;
    }
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }
  /**
   * Sets the rotation component of this matrix to the rotation specified by
   * the given Quaternion as outlined [here](https://en.wikipedia.org/wiki/Rotation_matrix#Quaternion)
   * The rest of the matrix is set to the identity.
   *
   * @param {Quaternion} q - The Quaternion.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationFromQuaternion(q) {
    return this.compose(_zero, q, _one);
  }
  /**
   * Sets the rotation component of the transformation matrix, looking from `eye` towards
   * `target`, and oriented by the up-direction.
   *
   * @param {Vector3} eye - The eye vector.
   * @param {Vector3} target - The target vector.
   * @param {Vector3} up - The up vector.
   * @return {Matrix4} A reference to this matrix.
   */
  lookAt(eye, target, up) {
    const te = this.elements;
    _z.subVectors(eye, target);
    if (_z.lengthSq() === 0) {
      _z.z = 1;
    }
    _z.normalize();
    _x.crossVectors(up, _z);
    if (_x.lengthSq() === 0) {
      if (Math.abs(up.z) === 1) {
        _z.x += 1e-4;
      } else {
        _z.z += 1e-4;
      }
      _z.normalize();
      _x.crossVectors(up, _z);
    }
    _x.normalize();
    _y.crossVectors(_z, _x);
    te[0] = _x.x;
    te[4] = _y.x;
    te[8] = _z.x;
    te[1] = _x.y;
    te[5] = _y.y;
    te[9] = _z.y;
    te[2] = _x.z;
    te[6] = _y.z;
    te[10] = _z.z;
    return this;
  }
  /**
   * Post-multiplies this matrix by the given 4x4 matrix.
   *
   * @param {Matrix4} m - The matrix to multiply with.
   * @return {Matrix4} A reference to this matrix.
   */
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  /**
   * Pre-multiplies this matrix by the given 4x4 matrix.
   *
   * @param {Matrix4} m - The matrix to multiply with.
   * @return {Matrix4} A reference to this matrix.
   */
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  /**
   * Multiples the given 4x4 matrices and stores the result
   * in this matrix.
   *
   * @param {Matrix4} a - The first matrix.
   * @param {Matrix4} b - The second matrix.
   * @return {Matrix4} A reference to this matrix.
   */
  multiplyMatrices(a, b) {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;
    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
    return this;
  }
  /**
   * Multiplies every component of the matrix by the given scalar.
   *
   * @param {number} s - The scalar.
   * @return {Matrix4} A reference to this matrix.
   */
  multiplyScalar(s) {
    const te = this.elements;
    te[0] *= s;
    te[4] *= s;
    te[8] *= s;
    te[12] *= s;
    te[1] *= s;
    te[5] *= s;
    te[9] *= s;
    te[13] *= s;
    te[2] *= s;
    te[6] *= s;
    te[10] *= s;
    te[14] *= s;
    te[3] *= s;
    te[7] *= s;
    te[11] *= s;
    te[15] *= s;
    return this;
  }
  /**
   * Computes and returns the determinant of this matrix.
   *
   * Based on the method outlined [here](http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.html).
   *
   * @return {number} The determinant.
   */
  determinant() {
    const te = this.elements;
    const n11 = te[0], n12 = te[4], n13 = te[8], n14 = te[12];
    const n21 = te[1], n22 = te[5], n23 = te[9], n24 = te[13];
    const n31 = te[2], n32 = te[6], n33 = te[10], n34 = te[14];
    const n41 = te[3], n42 = te[7], n43 = te[11], n44 = te[15];
    const t11 = n23 * n34 - n24 * n33;
    const t12 = n22 * n34 - n24 * n32;
    const t13 = n22 * n33 - n23 * n32;
    const t21 = n21 * n34 - n24 * n31;
    const t22 = n21 * n33 - n23 * n31;
    const t23 = n21 * n32 - n22 * n31;
    return n11 * (n42 * t11 - n43 * t12 + n44 * t13) - n12 * (n41 * t11 - n43 * t21 + n44 * t22) + n13 * (n41 * t12 - n42 * t21 + n44 * t23) - n14 * (n41 * t13 - n42 * t22 + n43 * t23);
  }
  /**
   * Transposes this matrix in place.
   *
   * @return {Matrix4} A reference to this matrix.
   */
  transpose() {
    const te = this.elements;
    let tmp;
    tmp = te[1];
    te[1] = te[4];
    te[4] = tmp;
    tmp = te[2];
    te[2] = te[8];
    te[8] = tmp;
    tmp = te[6];
    te[6] = te[9];
    te[9] = tmp;
    tmp = te[3];
    te[3] = te[12];
    te[12] = tmp;
    tmp = te[7];
    te[7] = te[13];
    te[13] = tmp;
    tmp = te[11];
    te[11] = te[14];
    te[14] = tmp;
    return this;
  }
  /**
   * Sets the position component for this matrix from the given vector,
   * without affecting the rest of the matrix.
   *
   * @param {number|Vector3} x - The x component of the vector or alternatively the vector object.
   * @param {number} y - The y component of the vector.
   * @param {number} z - The z component of the vector.
   * @return {Matrix4} A reference to this matrix.
   */
  setPosition(x, y, z) {
    const te = this.elements;
    if (x.isVector3) {
      te[12] = x.x;
      te[13] = x.y;
      te[14] = x.z;
    } else {
      te[12] = x;
      te[13] = y;
      te[14] = z;
    }
    return this;
  }
  /**
   * Inverts this matrix, using the [analytic method](https://en.wikipedia.org/wiki/Invertible_matrix#Analytic_solution).
   * You can not invert with a determinant of zero. If you attempt this, the method produces
   * a zero matrix instead.
   *
   * @return {Matrix4} A reference to this matrix.
   */
  invert() {
    const te = this.elements, n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3], n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7], n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11], n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15], t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44, t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44, t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44, t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const detInv = 1 / det;
    te[0] = t11 * detInv;
    te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
    te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
    te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;
    te[4] = t12 * detInv;
    te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
    te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
    te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;
    te[8] = t13 * detInv;
    te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
    te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
    te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;
    te[12] = t14 * detInv;
    te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
    te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
    te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;
    return this;
  }
  /**
   * Multiplies the columns of this matrix by the given vector.
   *
   * @param {Vector3} v - The scale vector.
   * @return {Matrix4} A reference to this matrix.
   */
  scale(v) {
    const te = this.elements;
    const x = v.x, y = v.y, z = v.z;
    te[0] *= x;
    te[4] *= y;
    te[8] *= z;
    te[1] *= x;
    te[5] *= y;
    te[9] *= z;
    te[2] *= x;
    te[6] *= y;
    te[10] *= z;
    te[3] *= x;
    te[7] *= y;
    te[11] *= z;
    return this;
  }
  /**
   * Gets the maximum scale value of the three axes.
   *
   * @return {number} The maximum scale.
   */
  getMaxScaleOnAxis() {
    const te = this.elements;
    const scaleXSq = te[0] * te[0] + te[1] * te[1] + te[2] * te[2];
    const scaleYSq = te[4] * te[4] + te[5] * te[5] + te[6] * te[6];
    const scaleZSq = te[8] * te[8] + te[9] * te[9] + te[10] * te[10];
    return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
  }
  /**
   * Sets this matrix as a translation transform from the given vector.
   *
   * @param {number|Vector3} x - The amount to translate in the X axis or alternatively a translation vector.
   * @param {number} y - The amount to translate in the Y axis.
   * @param {number} z - The amount to translate in the z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  makeTranslation(x, y, z) {
    if (x.isVector3) {
      this.set(
        1,
        0,
        0,
        x.x,
        0,
        1,
        0,
        x.y,
        0,
        0,
        1,
        x.z,
        0,
        0,
        0,
        1
      );
    } else {
      this.set(
        1,
        0,
        0,
        x,
        0,
        1,
        0,
        y,
        0,
        0,
        1,
        z,
        0,
        0,
        0,
        1
      );
    }
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the X axis by
   * the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationX(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    this.set(
      1,
      0,
      0,
      0,
      0,
      c,
      -s,
      0,
      0,
      s,
      c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the Y axis by
   * the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationY(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    this.set(
      c,
      0,
      s,
      0,
      0,
      1,
      0,
      0,
      -s,
      0,
      c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the Z axis by
   * the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationZ(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    this.set(
      c,
      -s,
      0,
      0,
      s,
      c,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the given axis by
   * the given angle.
   *
   * This is a somewhat controversial but mathematically sound alternative to
   * rotating via Quaternions. See the discussion [here](https://www.gamedev.net/articles/programming/math-and-physics/do-we-really-need-quaternions-r1199).
   *
   * @param {Vector3} axis - The normalized rotation axis.
   * @param {number} angle - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationAxis(axis, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const x = axis.x, y = axis.y, z = axis.z;
    const tx = t * x, ty = t * y;
    this.set(
      tx * x + c,
      tx * y - s * z,
      tx * z + s * y,
      0,
      tx * y + s * z,
      ty * y + c,
      ty * z - s * x,
      0,
      tx * z - s * y,
      ty * z + s * x,
      t * z * z + c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a scale transformation.
   *
   * @param {number} x - The amount to scale in the X axis.
   * @param {number} y - The amount to scale in the Y axis.
   * @param {number} z - The amount to scale in the Z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  makeScale(x, y, z) {
    this.set(
      x,
      0,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      0,
      z,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a shear transformation.
   *
   * @param {number} xy - The amount to shear X by Y.
   * @param {number} xz - The amount to shear X by Z.
   * @param {number} yx - The amount to shear Y by X.
   * @param {number} yz - The amount to shear Y by Z.
   * @param {number} zx - The amount to shear Z by X.
   * @param {number} zy - The amount to shear Z by Y.
   * @return {Matrix4} A reference to this matrix.
   */
  makeShear(xy, xz, yx, yz, zx, zy) {
    this.set(
      1,
      yx,
      zx,
      0,
      xy,
      1,
      zy,
      0,
      xz,
      yz,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix to the transformation composed of the given position,
   * rotation (Quaternion) and scale.
   *
   * @param {Vector3} position - The position vector.
   * @param {Quaternion} quaternion - The rotation as a Quaternion.
   * @param {Vector3} scale - The scale vector.
   * @return {Matrix4} A reference to this matrix.
   */
  compose(position, quaternion, scale2) {
    const te = this.elements;
    const x = quaternion._x, y = quaternion._y, z = quaternion._z, w = quaternion._w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = scale2.x, sy = scale2.y, sz = scale2.z;
    te[0] = (1 - (yy + zz)) * sx;
    te[1] = (xy + wz) * sx;
    te[2] = (xz - wy) * sx;
    te[3] = 0;
    te[4] = (xy - wz) * sy;
    te[5] = (1 - (xx + zz)) * sy;
    te[6] = (yz + wx) * sy;
    te[7] = 0;
    te[8] = (xz + wy) * sz;
    te[9] = (yz - wx) * sz;
    te[10] = (1 - (xx + yy)) * sz;
    te[11] = 0;
    te[12] = position.x;
    te[13] = position.y;
    te[14] = position.z;
    te[15] = 1;
    return this;
  }
  /**
   * Decomposes this matrix into its position, rotation and scale components
   * and provides the result in the given objects.
   *
   * Note: Not all matrices are decomposable in this way. For example, if an
   * object has a non-uniformly scaled parent, then the object's world matrix
   * may not be decomposable, and this method may not be appropriate.
   *
   * @param {Vector3} position - The position vector.
   * @param {Quaternion} quaternion - The rotation as a Quaternion.
   * @param {Vector3} scale - The scale vector.
   * @return {Matrix4} A reference to this matrix.
   */
  decompose(position, quaternion, scale2) {
    const te = this.elements;
    position.x = te[12];
    position.y = te[13];
    position.z = te[14];
    if (this.determinant() === 0) {
      scale2.set(1, 1, 1);
      quaternion.identity();
      return this;
    }
    let sx = _v1$5.set(te[0], te[1], te[2]).length();
    const sy = _v1$5.set(te[4], te[5], te[6]).length();
    const sz = _v1$5.set(te[8], te[9], te[10]).length();
    const det = this.determinant();
    if (det < 0) sx = -sx;
    _m1$2.copy(this);
    const invSX = 1 / sx;
    const invSY = 1 / sy;
    const invSZ = 1 / sz;
    _m1$2.elements[0] *= invSX;
    _m1$2.elements[1] *= invSX;
    _m1$2.elements[2] *= invSX;
    _m1$2.elements[4] *= invSY;
    _m1$2.elements[5] *= invSY;
    _m1$2.elements[6] *= invSY;
    _m1$2.elements[8] *= invSZ;
    _m1$2.elements[9] *= invSZ;
    _m1$2.elements[10] *= invSZ;
    quaternion.setFromRotationMatrix(_m1$2);
    scale2.x = sx;
    scale2.y = sy;
    scale2.z = sz;
    return this;
  }
  /**
  	 * Creates a perspective projection matrix. This is used internally by
  	 * {@link PerspectiveCamera#updateProjectionMatrix}.
  
  	 * @param {number} left - Left boundary of the viewing frustum at the near plane.
  	 * @param {number} right - Right boundary of the viewing frustum at the near plane.
  	 * @param {number} top - Top boundary of the viewing frustum at the near plane.
  	 * @param {number} bottom - Bottom boundary of the viewing frustum at the near plane.
  	 * @param {number} near - The distance from the camera to the near plane.
  	 * @param {number} far - The distance from the camera to the far plane.
  	 * @param {(WebGLCoordinateSystem|WebGPUCoordinateSystem)} [coordinateSystem=WebGLCoordinateSystem] - The coordinate system.
  	 * @param {boolean} [reversedDepth=false] - Whether to use a reversed depth.
  	 * @return {Matrix4} A reference to this matrix.
  	 */
  makePerspective(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem, reversedDepth = false) {
    const te = this.elements;
    const x = 2 * near / (right - left);
    const y = 2 * near / (top - bottom);
    const a = (right + left) / (right - left);
    const b = (top + bottom) / (top - bottom);
    let c, d;
    if (reversedDepth) {
      c = near / (far - near);
      d = far * near / (far - near);
    } else {
      if (coordinateSystem === WebGLCoordinateSystem) {
        c = -(far + near) / (far - near);
        d = -2 * far * near / (far - near);
      } else if (coordinateSystem === WebGPUCoordinateSystem) {
        c = -far / (far - near);
        d = -far * near / (far - near);
      } else {
        throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: " + coordinateSystem);
      }
    }
    te[0] = x;
    te[4] = 0;
    te[8] = a;
    te[12] = 0;
    te[1] = 0;
    te[5] = y;
    te[9] = b;
    te[13] = 0;
    te[2] = 0;
    te[6] = 0;
    te[10] = c;
    te[14] = d;
    te[3] = 0;
    te[7] = 0;
    te[11] = -1;
    te[15] = 0;
    return this;
  }
  /**
  	 * Creates a orthographic projection matrix. This is used internally by
  	 * {@link OrthographicCamera#updateProjectionMatrix}.
  
  	 * @param {number} left - Left boundary of the viewing frustum at the near plane.
  	 * @param {number} right - Right boundary of the viewing frustum at the near plane.
  	 * @param {number} top - Top boundary of the viewing frustum at the near plane.
  	 * @param {number} bottom - Bottom boundary of the viewing frustum at the near plane.
  	 * @param {number} near - The distance from the camera to the near plane.
  	 * @param {number} far - The distance from the camera to the far plane.
  	 * @param {(WebGLCoordinateSystem|WebGPUCoordinateSystem)} [coordinateSystem=WebGLCoordinateSystem] - The coordinate system.
  	 * @param {boolean} [reversedDepth=false] - Whether to use a reversed depth.
  	 * @return {Matrix4} A reference to this matrix.
  	 */
  makeOrthographic(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem, reversedDepth = false) {
    const te = this.elements;
    const x = 2 / (right - left);
    const y = 2 / (top - bottom);
    const a = -(right + left) / (right - left);
    const b = -(top + bottom) / (top - bottom);
    let c, d;
    if (reversedDepth) {
      c = 1 / (far - near);
      d = far / (far - near);
    } else {
      if (coordinateSystem === WebGLCoordinateSystem) {
        c = -2 / (far - near);
        d = -(far + near) / (far - near);
      } else if (coordinateSystem === WebGPUCoordinateSystem) {
        c = -1 / (far - near);
        d = -near / (far - near);
      } else {
        throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: " + coordinateSystem);
      }
    }
    te[0] = x;
    te[4] = 0;
    te[8] = 0;
    te[12] = a;
    te[1] = 0;
    te[5] = y;
    te[9] = 0;
    te[13] = b;
    te[2] = 0;
    te[6] = 0;
    te[10] = c;
    te[14] = d;
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[15] = 1;
    return this;
  }
  /**
   * Returns `true` if this matrix is equal with the given one.
   *
   * @param {Matrix4} matrix - The matrix to test for equality.
   * @return {boolean} Whether this matrix is equal with the given one.
   */
  equals(matrix) {
    const te = this.elements;
    const me = matrix.elements;
    for (let i = 0; i < 16; i++) {
      if (te[i] !== me[i]) return false;
    }
    return true;
  }
  /**
   * Sets the elements of the matrix from the given array.
   *
   * @param {Array<number>} array - The matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Matrix4} A reference to this matrix.
   */
  fromArray(array, offset = 0) {
    for (let i = 0; i < 16; i++) {
      this.elements[i] = array[i + offset];
    }
    return this;
  }
  /**
   * Writes the elements of this matrix to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The matrix elements in column-major order.
   */
  toArray(array = [], offset = 0) {
    const te = this.elements;
    array[offset] = te[0];
    array[offset + 1] = te[1];
    array[offset + 2] = te[2];
    array[offset + 3] = te[3];
    array[offset + 4] = te[4];
    array[offset + 5] = te[5];
    array[offset + 6] = te[6];
    array[offset + 7] = te[7];
    array[offset + 8] = te[8];
    array[offset + 9] = te[9];
    array[offset + 10] = te[10];
    array[offset + 11] = te[11];
    array[offset + 12] = te[12];
    array[offset + 13] = te[13];
    array[offset + 14] = te[14];
    array[offset + 15] = te[15];
    return array;
  }
};
var _v1$5 = /* @__PURE__ */ new Vector3();
var _m1$2 = /* @__PURE__ */ new Matrix4();
var _zero = /* @__PURE__ */ new Vector3(0, 0, 0);
var _one = /* @__PURE__ */ new Vector3(1, 1, 1);
var _x = /* @__PURE__ */ new Vector3();
var _y = /* @__PURE__ */ new Vector3();
var _z = /* @__PURE__ */ new Vector3();
var _matrix$2 = /* @__PURE__ */ new Matrix4();
var _quaternion$3 = /* @__PURE__ */ new Quaternion();
var Euler = class _Euler {
  /**
   * Constructs a new euler instance.
   *
   * @param {number} [x=0] - The angle of the x axis in radians.
   * @param {number} [y=0] - The angle of the y axis in radians.
   * @param {number} [z=0] - The angle of the z axis in radians.
   * @param {string} [order=Euler.DEFAULT_ORDER] - A string representing the order that the rotations are applied.
   */
  constructor(x = 0, y = 0, z = 0, order = _Euler.DEFAULT_ORDER) {
    this.isEuler = true;
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
  }
  /**
   * The angle of the x axis in radians.
   *
   * @type {number}
   * @default 0
   */
  get x() {
    return this._x;
  }
  set x(value) {
    this._x = value;
    this._onChangeCallback();
  }
  /**
   * The angle of the y axis in radians.
   *
   * @type {number}
   * @default 0
   */
  get y() {
    return this._y;
  }
  set y(value) {
    this._y = value;
    this._onChangeCallback();
  }
  /**
   * The angle of the z axis in radians.
   *
   * @type {number}
   * @default 0
   */
  get z() {
    return this._z;
  }
  set z(value) {
    this._z = value;
    this._onChangeCallback();
  }
  /**
   * A string representing the order that the rotations are applied.
   *
   * @type {string}
   * @default 'XYZ'
   */
  get order() {
    return this._order;
  }
  set order(value) {
    this._order = value;
    this._onChangeCallback();
  }
  /**
   * Sets the Euler components.
   *
   * @param {number} x - The angle of the x axis in radians.
   * @param {number} y - The angle of the y axis in radians.
   * @param {number} z - The angle of the z axis in radians.
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @return {Euler} A reference to this Euler instance.
   */
  set(x, y, z, order = this._order) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
    this._onChangeCallback();
    return this;
  }
  /**
   * Returns a new Euler instance with copied values from this instance.
   *
   * @return {Euler} A clone of this instance.
   */
  clone() {
    return new this.constructor(this._x, this._y, this._z, this._order);
  }
  /**
   * Copies the values of the given Euler instance to this instance.
   *
   * @param {Euler} euler - The Euler instance to copy.
   * @return {Euler} A reference to this Euler instance.
   */
  copy(euler) {
    this._x = euler._x;
    this._y = euler._y;
    this._z = euler._z;
    this._order = euler._order;
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets the angles of this Euler instance from a pure rotation matrix.
   *
   * @param {Matrix4} m - A 4x4 matrix of which the upper 3x3 of matrix is a pure rotation matrix (i.e. unscaled).
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @param {boolean} [update=true] - Whether the internal `onChange` callback should be executed or not.
   * @return {Euler} A reference to this Euler instance.
   */
  setFromRotationMatrix(m, order = this._order, update = true) {
    const te = m.elements;
    const m11 = te[0], m12 = te[4], m13 = te[8];
    const m21 = te[1], m22 = te[5], m23 = te[9];
    const m31 = te[2], m32 = te[6], m33 = te[10];
    switch (order) {
      case "XYZ":
        this._y = Math.asin(clamp(m13, -1, 1));
        if (Math.abs(m13) < 0.9999999) {
          this._x = Math.atan2(-m23, m33);
          this._z = Math.atan2(-m12, m11);
        } else {
          this._x = Math.atan2(m32, m22);
          this._z = 0;
        }
        break;
      case "YXZ":
        this._x = Math.asin(-clamp(m23, -1, 1));
        if (Math.abs(m23) < 0.9999999) {
          this._y = Math.atan2(m13, m33);
          this._z = Math.atan2(m21, m22);
        } else {
          this._y = Math.atan2(-m31, m11);
          this._z = 0;
        }
        break;
      case "ZXY":
        this._x = Math.asin(clamp(m32, -1, 1));
        if (Math.abs(m32) < 0.9999999) {
          this._y = Math.atan2(-m31, m33);
          this._z = Math.atan2(-m12, m22);
        } else {
          this._y = 0;
          this._z = Math.atan2(m21, m11);
        }
        break;
      case "ZYX":
        this._y = Math.asin(-clamp(m31, -1, 1));
        if (Math.abs(m31) < 0.9999999) {
          this._x = Math.atan2(m32, m33);
          this._z = Math.atan2(m21, m11);
        } else {
          this._x = 0;
          this._z = Math.atan2(-m12, m22);
        }
        break;
      case "YZX":
        this._z = Math.asin(clamp(m21, -1, 1));
        if (Math.abs(m21) < 0.9999999) {
          this._x = Math.atan2(-m23, m22);
          this._y = Math.atan2(-m31, m11);
        } else {
          this._x = 0;
          this._y = Math.atan2(m13, m33);
        }
        break;
      case "XZY":
        this._z = Math.asin(-clamp(m12, -1, 1));
        if (Math.abs(m12) < 0.9999999) {
          this._x = Math.atan2(m32, m22);
          this._y = Math.atan2(m13, m11);
        } else {
          this._x = Math.atan2(-m23, m33);
          this._y = 0;
        }
        break;
      default:
        warn("Euler: .setFromRotationMatrix() encountered an unknown order: " + order);
    }
    this._order = order;
    if (update === true) this._onChangeCallback();
    return this;
  }
  /**
   * Sets the angles of this Euler instance from a normalized quaternion.
   *
   * @param {Quaternion} q - A normalized Quaternion.
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @param {boolean} [update=true] - Whether the internal `onChange` callback should be executed or not.
   * @return {Euler} A reference to this Euler instance.
   */
  setFromQuaternion(q, order, update) {
    _matrix$2.makeRotationFromQuaternion(q);
    return this.setFromRotationMatrix(_matrix$2, order, update);
  }
  /**
   * Sets the angles of this Euler instance from the given vector.
   *
   * @param {Vector3} v - The vector.
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @return {Euler} A reference to this Euler instance.
   */
  setFromVector3(v, order = this._order) {
    return this.set(v.x, v.y, v.z, order);
  }
  /**
   * Resets the euler angle with a new order by creating a quaternion from this
   * euler angle and then setting this euler angle with the quaternion and the
   * new order.
   *
   * Warning: This discards revolution information.
   *
   * @param {string} [newOrder] - A string representing the new order that the rotations are applied.
   * @return {Euler} A reference to this Euler instance.
   */
  reorder(newOrder) {
    _quaternion$3.setFromEuler(this);
    return this.setFromQuaternion(_quaternion$3, newOrder);
  }
  /**
   * Returns `true` if this Euler instance is equal with the given one.
   *
   * @param {Euler} euler - The Euler instance to test for equality.
   * @return {boolean} Whether this Euler instance is equal with the given one.
   */
  equals(euler) {
    return euler._x === this._x && euler._y === this._y && euler._z === this._z && euler._order === this._order;
  }
  /**
   * Sets this Euler instance's components to values from the given array. The first three
   * entries of the array are assign to the x,y and z components. An optional fourth entry
   * defines the Euler order.
   *
   * @param {Array<number,number,number,?string>} array - An array holding the Euler component values.
   * @return {Euler} A reference to this Euler instance.
   */
  fromArray(array) {
    this._x = array[0];
    this._y = array[1];
    this._z = array[2];
    if (array[3] !== void 0) this._order = array[3];
    this._onChangeCallback();
    return this;
  }
  /**
   * Writes the components of this Euler instance to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number,number,number,string>} [array=[]] - The target array holding the Euler components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number,number,number,string>} The Euler components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._order;
    return array;
  }
  _onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }
  _onChangeCallback() {
  }
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._order;
  }
};
Euler.DEFAULT_ORDER = "XYZ";
var Layers = class {
  /**
   * Constructs a new layers instance, with membership
   * initially set to layer `0`.
   */
  constructor() {
    this.mask = 1 | 0;
  }
  /**
   * Sets membership to the given layer, and remove membership all other layers.
   *
   * @param {number} layer - The layer to set.
   */
  set(layer) {
    this.mask = (1 << layer | 0) >>> 0;
  }
  /**
   * Adds membership of the given layer.
   *
   * @param {number} layer - The layer to enable.
   */
  enable(layer) {
    this.mask |= 1 << layer | 0;
  }
  /**
   * Adds membership to all layers.
   */
  enableAll() {
    this.mask = 4294967295 | 0;
  }
  /**
   * Toggles the membership of the given layer.
   *
   * @param {number} layer - The layer to toggle.
   */
  toggle(layer) {
    this.mask ^= 1 << layer | 0;
  }
  /**
   * Removes membership of the given layer.
   *
   * @param {number} layer - The layer to enable.
   */
  disable(layer) {
    this.mask &= ~(1 << layer | 0);
  }
  /**
   * Removes the membership from all layers.
   */
  disableAll() {
    this.mask = 0;
  }
  /**
   * Returns `true` if this and the given layers object have at least one
   * layer in common.
   *
   * @param {Layers} layers - The layers to test.
   * @return {boolean } Whether this and the given layers object have at least one layer in common or not.
   */
  test(layers) {
    return (this.mask & layers.mask) !== 0;
  }
  /**
   * Returns `true` if the given layer is enabled.
   *
   * @param {number} layer - The layer to test.
   * @return {boolean } Whether the given layer is enabled or not.
   */
  isEnabled(layer) {
    return (this.mask & (1 << layer | 0)) !== 0;
  }
};
var _object3DId = 0;
var _v1$4 = /* @__PURE__ */ new Vector3();
var _q1 = /* @__PURE__ */ new Quaternion();
var _m1$1 = /* @__PURE__ */ new Matrix4();
var _target = /* @__PURE__ */ new Vector3();
var _position$3 = /* @__PURE__ */ new Vector3();
var _scale$2 = /* @__PURE__ */ new Vector3();
var _quaternion$2 = /* @__PURE__ */ new Quaternion();
var _xAxis = /* @__PURE__ */ new Vector3(1, 0, 0);
var _yAxis = /* @__PURE__ */ new Vector3(0, 1, 0);
var _zAxis = /* @__PURE__ */ new Vector3(0, 0, 1);
var _addedEvent = { type: "added" };
var _removedEvent = { type: "removed" };
var _childaddedEvent = { type: "childadded", child: null };
var _childremovedEvent = { type: "childremoved", child: null };
var Object3D = class _Object3D extends EventDispatcher {
  /**
   * Constructs a new 3D object.
   */
  constructor() {
    super();
    this.isObject3D = true;
    Object.defineProperty(this, "id", { value: _object3DId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.type = "Object3D";
    this.parent = null;
    this.children = [];
    this.up = _Object3D.DEFAULT_UP.clone();
    const position = new Vector3();
    const rotation = new Euler();
    const quaternion = new Quaternion();
    const scale2 = new Vector3(1, 1, 1);
    function onRotationChange() {
      quaternion.setFromEuler(rotation, false);
    }
    function onQuaternionChange() {
      rotation.setFromQuaternion(quaternion, void 0, false);
    }
    rotation._onChange(onRotationChange);
    quaternion._onChange(onQuaternionChange);
    Object.defineProperties(this, {
      /**
       * Represents the object's local position.
       *
       * @name Object3D#position
       * @type {Vector3}
       * @default (0,0,0)
       */
      position: {
        configurable: true,
        enumerable: true,
        value: position
      },
      /**
       * Represents the object's local rotation as Euler angles, in radians.
       *
       * @name Object3D#rotation
       * @type {Euler}
       * @default (0,0,0)
       */
      rotation: {
        configurable: true,
        enumerable: true,
        value: rotation
      },
      /**
       * Represents the object's local rotation as Quaternions.
       *
       * @name Object3D#quaternion
       * @type {Quaternion}
       */
      quaternion: {
        configurable: true,
        enumerable: true,
        value: quaternion
      },
      /**
       * Represents the object's local scale.
       *
       * @name Object3D#scale
       * @type {Vector3}
       * @default (1,1,1)
       */
      scale: {
        configurable: true,
        enumerable: true,
        value: scale2
      },
      /**
       * Represents the object's model-view matrix.
       *
       * @name Object3D#modelViewMatrix
       * @type {Matrix4}
       */
      modelViewMatrix: {
        value: new Matrix4()
      },
      /**
       * Represents the object's normal matrix.
       *
       * @name Object3D#normalMatrix
       * @type {Matrix3}
       */
      normalMatrix: {
        value: new Matrix3()
      }
    });
    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();
    this.matrixAutoUpdate = _Object3D.DEFAULT_MATRIX_AUTO_UPDATE;
    this.matrixWorldAutoUpdate = _Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE;
    this.matrixWorldNeedsUpdate = false;
    this.layers = new Layers();
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.animations = [];
    this.customDepthMaterial = void 0;
    this.customDistanceMaterial = void 0;
    this.userData = {};
  }
  /**
   * A callback that is executed immediately before a 3D object is rendered to a shadow map.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {Camera} shadowCamera - The shadow camera.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} depthMaterial - The depth material.
   * @param {Object} group - The geometry group data.
   */
  onBeforeShadow() {
  }
  /**
   * A callback that is executed immediately after a 3D object is rendered to a shadow map.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {Camera} shadowCamera - The shadow camera.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} depthMaterial - The depth material.
   * @param {Object} group - The geometry group data.
   */
  onAfterShadow() {
  }
  /**
   * A callback that is executed immediately before a 3D object is rendered.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} material - The 3D object's material.
   * @param {Object} group - The geometry group data.
   */
  onBeforeRender() {
  }
  /**
   * A callback that is executed immediately after a 3D object is rendered.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} material - The 3D object's material.
   * @param {Object} group - The geometry group data.
   */
  onAfterRender() {
  }
  /**
   * Applies the given transformation matrix to the object and updates the object's position,
   * rotation and scale.
   *
   * @param {Matrix4} matrix - The transformation matrix.
   */
  applyMatrix4(matrix) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    this.matrix.premultiply(matrix);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }
  /**
   * Applies a rotation represented by given the quaternion to the 3D object.
   *
   * @param {Quaternion} q - The quaternion.
   * @return {Object3D} A reference to this instance.
   */
  applyQuaternion(q) {
    this.quaternion.premultiply(q);
    return this;
  }
  /**
   * Sets the given rotation represented as an axis/angle couple to the 3D object.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} angle - The angle in radians.
   */
  setRotationFromAxisAngle(axis, angle) {
    this.quaternion.setFromAxisAngle(axis, angle);
  }
  /**
   * Sets the given rotation represented as Euler angles to the 3D object.
   *
   * @param {Euler} euler - The Euler angles.
   */
  setRotationFromEuler(euler) {
    this.quaternion.setFromEuler(euler, true);
  }
  /**
   * Sets the given rotation represented as rotation matrix to the 3D object.
   *
   * @param {Matrix4} m - Although a 4x4 matrix is expected, the upper 3x3 portion must be
   * a pure rotation matrix (i.e, unscaled).
   */
  setRotationFromMatrix(m) {
    this.quaternion.setFromRotationMatrix(m);
  }
  /**
   * Sets the given rotation represented as a Quaternion to the 3D object.
   *
   * @param {Quaternion} q - The Quaternion
   */
  setRotationFromQuaternion(q) {
    this.quaternion.copy(q);
  }
  /**
   * Rotates the 3D object along an axis in local space.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateOnAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.multiply(_q1);
    return this;
  }
  /**
   * Rotates the 3D object along an axis in world space.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateOnWorldAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.premultiply(_q1);
    return this;
  }
  /**
   * Rotates the 3D object around its X axis in local space.
   *
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateX(angle) {
    return this.rotateOnAxis(_xAxis, angle);
  }
  /**
   * Rotates the 3D object around its Y axis in local space.
   *
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateY(angle) {
    return this.rotateOnAxis(_yAxis, angle);
  }
  /**
   * Rotates the 3D object around its Z axis in local space.
   *
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateZ(angle) {
    return this.rotateOnAxis(_zAxis, angle);
  }
  /**
   * Translate the 3D object by a distance along the given axis in local space.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateOnAxis(axis, distance) {
    _v1$4.copy(axis).applyQuaternion(this.quaternion);
    this.position.add(_v1$4.multiplyScalar(distance));
    return this;
  }
  /**
   * Translate the 3D object by a distance along its X-axis in local space.
   *
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateX(distance) {
    return this.translateOnAxis(_xAxis, distance);
  }
  /**
   * Translate the 3D object by a distance along its Y-axis in local space.
   *
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateY(distance) {
    return this.translateOnAxis(_yAxis, distance);
  }
  /**
   * Translate the 3D object by a distance along its Z-axis in local space.
   *
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateZ(distance) {
    return this.translateOnAxis(_zAxis, distance);
  }
  /**
   * Converts the given vector from this 3D object's local space to world space.
   *
   * @param {Vector3} vector - The vector to convert.
   * @return {Vector3} The converted vector.
   */
  localToWorld(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(this.matrixWorld);
  }
  /**
   * Converts the given vector from this 3D object's word space to local space.
   *
   * @param {Vector3} vector - The vector to convert.
   * @return {Vector3} The converted vector.
   */
  worldToLocal(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(_m1$1.copy(this.matrixWorld).invert());
  }
  /**
   * Rotates the object to face a point in world space.
   *
   * This method does not support objects having non-uniformly-scaled parent(s).
   *
   * @param {number|Vector3} x - The x coordinate in world space. Alternatively, a vector representing a position in world space
   * @param {number} [y] - The y coordinate in world space.
   * @param {number} [z] - The z coordinate in world space.
   */
  lookAt(x, y, z) {
    if (x.isVector3) {
      _target.copy(x);
    } else {
      _target.set(x, y, z);
    }
    const parent = this.parent;
    this.updateWorldMatrix(true, false);
    _position$3.setFromMatrixPosition(this.matrixWorld);
    if (this.isCamera || this.isLight) {
      _m1$1.lookAt(_position$3, _target, this.up);
    } else {
      _m1$1.lookAt(_target, _position$3, this.up);
    }
    this.quaternion.setFromRotationMatrix(_m1$1);
    if (parent) {
      _m1$1.extractRotation(parent.matrixWorld);
      _q1.setFromRotationMatrix(_m1$1);
      this.quaternion.premultiply(_q1.invert());
    }
  }
  /**
   * Adds the given 3D object as a child to this 3D object. An arbitrary number of
   * objects may be added. Any current parent on an object passed in here will be
   * removed, since an object can have at most one parent.
   *
   * @fires Object3D#added
   * @fires Object3D#childadded
   * @param {Object3D} object - The 3D object to add.
   * @return {Object3D} A reference to this instance.
   */
  add(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.add(arguments[i]);
      }
      return this;
    }
    if (object === this) {
      error("Object3D.add: object can't be added as a child of itself.", object);
      return this;
    }
    if (object && object.isObject3D) {
      object.removeFromParent();
      object.parent = this;
      this.children.push(object);
      object.dispatchEvent(_addedEvent);
      _childaddedEvent.child = object;
      this.dispatchEvent(_childaddedEvent);
      _childaddedEvent.child = null;
    } else {
      error("Object3D.add: object not an instance of THREE.Object3D.", object);
    }
    return this;
  }
  /**
   * Removes the given 3D object as child from this 3D object.
   * An arbitrary number of objects may be removed.
   *
   * @fires Object3D#removed
   * @fires Object3D#childremoved
   * @param {Object3D} object - The 3D object to remove.
   * @return {Object3D} A reference to this instance.
   */
  remove(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.remove(arguments[i]);
      }
      return this;
    }
    const index = this.children.indexOf(object);
    if (index !== -1) {
      object.parent = null;
      this.children.splice(index, 1);
      object.dispatchEvent(_removedEvent);
      _childremovedEvent.child = object;
      this.dispatchEvent(_childremovedEvent);
      _childremovedEvent.child = null;
    }
    return this;
  }
  /**
   * Removes this 3D object from its current parent.
   *
   * @fires Object3D#removed
   * @fires Object3D#childremoved
   * @return {Object3D} A reference to this instance.
   */
  removeFromParent() {
    const parent = this.parent;
    if (parent !== null) {
      parent.remove(this);
    }
    return this;
  }
  /**
   * Removes all child objects.
   *
   * @fires Object3D#removed
   * @fires Object3D#childremoved
   * @return {Object3D} A reference to this instance.
   */
  clear() {
    return this.remove(...this.children);
  }
  /**
   * Adds the given 3D object as a child of this 3D object, while maintaining the object's world
   * transform. This method does not support scene graphs having non-uniformly-scaled nodes(s).
   *
   * @fires Object3D#added
   * @fires Object3D#childadded
   * @param {Object3D} object - The 3D object to attach.
   * @return {Object3D} A reference to this instance.
   */
  attach(object) {
    this.updateWorldMatrix(true, false);
    _m1$1.copy(this.matrixWorld).invert();
    if (object.parent !== null) {
      object.parent.updateWorldMatrix(true, false);
      _m1$1.multiply(object.parent.matrixWorld);
    }
    object.applyMatrix4(_m1$1);
    object.removeFromParent();
    object.parent = this;
    this.children.push(object);
    object.updateWorldMatrix(false, true);
    object.dispatchEvent(_addedEvent);
    _childaddedEvent.child = object;
    this.dispatchEvent(_childaddedEvent);
    _childaddedEvent.child = null;
    return this;
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns the first with a matching ID.
   *
   * @param {number} id - The id.
   * @return {Object3D|undefined} The found 3D object. Returns `undefined` if no 3D object has been found.
   */
  getObjectById(id) {
    return this.getObjectByProperty("id", id);
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns the first with a matching name.
   *
   * @param {string} name - The name.
   * @return {Object3D|undefined} The found 3D object. Returns `undefined` if no 3D object has been found.
   */
  getObjectByName(name) {
    return this.getObjectByProperty("name", name);
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns the first with a matching property value.
   *
   * @param {string} name - The name of the property.
   * @param {any} value - The value.
   * @return {Object3D|undefined} The found 3D object. Returns `undefined` if no 3D object has been found.
   */
  getObjectByProperty(name, value) {
    if (this[name] === value) return this;
    for (let i = 0, l = this.children.length; i < l; i++) {
      const child = this.children[i];
      const object = child.getObjectByProperty(name, value);
      if (object !== void 0) {
        return object;
      }
    }
    return void 0;
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns all 3D objects with a matching property value.
   *
   * @param {string} name - The name of the property.
   * @param {any} value - The value.
   * @param {Array<Object3D>} result - The method stores the result in this array.
   * @return {Array<Object3D>} The found 3D objects.
   */
  getObjectsByProperty(name, value, result = []) {
    if (this[name] === value) result.push(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].getObjectsByProperty(name, value, result);
    }
    return result;
  }
  /**
   * Returns a vector representing the position of the 3D object in world space.
   *
   * @param {Vector3} target - The target vector the result is stored to.
   * @return {Vector3} The 3D object's position in world space.
   */
  getWorldPosition(target) {
    this.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.matrixWorld);
  }
  /**
   * Returns a Quaternion representing the position of the 3D object in world space.
   *
   * @param {Quaternion} target - The target Quaternion the result is stored to.
   * @return {Quaternion} The 3D object's rotation in world space.
   */
  getWorldQuaternion(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position$3, target, _scale$2);
    return target;
  }
  /**
   * Returns a vector representing the scale of the 3D object in world space.
   *
   * @param {Vector3} target - The target vector the result is stored to.
   * @return {Vector3} The 3D object's scale in world space.
   */
  getWorldScale(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position$3, _quaternion$2, target);
    return target;
  }
  /**
   * Returns a vector representing the ("look") direction of the 3D object in world space.
   *
   * @param {Vector3} target - The target vector the result is stored to.
   * @return {Vector3} The 3D object's direction in world space.
   */
  getWorldDirection(target) {
    this.updateWorldMatrix(true, false);
    const e = this.matrixWorld.elements;
    return target.set(e[8], e[9], e[10]).normalize();
  }
  /**
   * Abstract method to get intersections between a casted ray and this
   * 3D object. Renderable 3D objects such as {@link Mesh}, {@link Line} or {@link Points}
   * implement this method in order to use raycasting.
   *
   * @abstract
   * @param {Raycaster} raycaster - The raycaster.
   * @param {Array<Object>} intersects - An array holding the result of the method.
   */
  raycast() {
  }
  /**
   * Executes the callback on this 3D object and all descendants.
   *
   * Note: Modifying the scene graph inside the callback is discouraged.
   *
   * @param {Function} callback - A callback function that allows to process the current 3D object.
   */
  traverse(callback) {
    callback(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverse(callback);
    }
  }
  /**
   * Like {@link Object3D#traverse}, but the callback will only be executed for visible 3D objects.
   * Descendants of invisible 3D objects are not traversed.
   *
   * Note: Modifying the scene graph inside the callback is discouraged.
   *
   * @param {Function} callback - A callback function that allows to process the current 3D object.
   */
  traverseVisible(callback) {
    if (this.visible === false) return;
    callback(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverseVisible(callback);
    }
  }
  /**
   * Like {@link Object3D#traverse}, but the callback will only be executed for all ancestors.
   *
   * Note: Modifying the scene graph inside the callback is discouraged.
   *
   * @param {Function} callback - A callback function that allows to process the current 3D object.
   */
  traverseAncestors(callback) {
    const parent = this.parent;
    if (parent !== null) {
      callback(parent);
      parent.traverseAncestors(callback);
    }
  }
  /**
   * Updates the transformation matrix in local space by computing it from the current
   * position, rotation and scale values.
   */
  updateMatrix() {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = true;
  }
  /**
   * Updates the transformation matrix in world space of this 3D objects and its descendants.
   *
   * To ensure correct results, this method also recomputes the 3D object's transformation matrix in
   * local space. The computation of the local and world matrix can be controlled with the
   * {@link Object3D#matrixAutoUpdate} and {@link Object3D#matrixWorldAutoUpdate} flags which are both
   * `true` by default.  Set these flags to `false` if you need more control over the update matrix process.
   *
   * @param {boolean} [force=false] - When set to `true`, a recomputation of world matrices is forced even
   * when {@link Object3D#matrixWorldAutoUpdate} is set to `false`.
   */
  updateMatrixWorld(force) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate === true) {
        if (this.parent === null) {
          this.matrixWorld.copy(this.matrix);
        } else {
          this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
        }
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];
      child.updateMatrixWorld(force);
    }
  }
  /**
   * An alternative version of {@link Object3D#updateMatrixWorld} with more control over the
   * update of ancestor and descendant nodes.
   *
   * @param {boolean} [updateParents=false] Whether ancestor nodes should be updated or not.
   * @param {boolean} [updateChildren=false] Whether descendant nodes should be updated or not.
   */
  updateWorldMatrix(updateParents, updateChildren) {
    const parent = this.parent;
    if (updateParents === true && parent !== null) {
      parent.updateWorldMatrix(true, false);
    }
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldAutoUpdate === true) {
      if (this.parent === null) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
    }
    if (updateChildren === true) {
      const children = this.children;
      for (let i = 0, l = children.length; i < l; i++) {
        const child = children[i];
        child.updateWorldMatrix(false, true);
      }
    }
  }
  /**
   * Serializes the 3D object into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized 3D object.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    const output = {};
    if (isRootObject) {
      meta = {
        geometries: {},
        materials: {},
        textures: {},
        images: {},
        shapes: {},
        skeletons: {},
        animations: {},
        nodes: {}
      };
      output.metadata = {
        version: 4.7,
        type: "Object",
        generator: "Object3D.toJSON"
      };
    }
    const object = {};
    object.uuid = this.uuid;
    object.type = this.type;
    if (this.name !== "") object.name = this.name;
    if (this.castShadow === true) object.castShadow = true;
    if (this.receiveShadow === true) object.receiveShadow = true;
    if (this.visible === false) object.visible = false;
    if (this.frustumCulled === false) object.frustumCulled = false;
    if (this.renderOrder !== 0) object.renderOrder = this.renderOrder;
    if (Object.keys(this.userData).length > 0) object.userData = this.userData;
    object.layers = this.layers.mask;
    object.matrix = this.matrix.toArray();
    object.up = this.up.toArray();
    if (this.matrixAutoUpdate === false) object.matrixAutoUpdate = false;
    if (this.isInstancedMesh) {
      object.type = "InstancedMesh";
      object.count = this.count;
      object.instanceMatrix = this.instanceMatrix.toJSON();
      if (this.instanceColor !== null) object.instanceColor = this.instanceColor.toJSON();
    }
    if (this.isBatchedMesh) {
      object.type = "BatchedMesh";
      object.perObjectFrustumCulled = this.perObjectFrustumCulled;
      object.sortObjects = this.sortObjects;
      object.drawRanges = this._drawRanges;
      object.reservedRanges = this._reservedRanges;
      object.geometryInfo = this._geometryInfo.map((info) => ({
        ...info,
        boundingBox: info.boundingBox ? info.boundingBox.toJSON() : void 0,
        boundingSphere: info.boundingSphere ? info.boundingSphere.toJSON() : void 0
      }));
      object.instanceInfo = this._instanceInfo.map((info) => ({ ...info }));
      object.availableInstanceIds = this._availableInstanceIds.slice();
      object.availableGeometryIds = this._availableGeometryIds.slice();
      object.nextIndexStart = this._nextIndexStart;
      object.nextVertexStart = this._nextVertexStart;
      object.geometryCount = this._geometryCount;
      object.maxInstanceCount = this._maxInstanceCount;
      object.maxVertexCount = this._maxVertexCount;
      object.maxIndexCount = this._maxIndexCount;
      object.geometryInitialized = this._geometryInitialized;
      object.matricesTexture = this._matricesTexture.toJSON(meta);
      object.indirectTexture = this._indirectTexture.toJSON(meta);
      if (this._colorsTexture !== null) {
        object.colorsTexture = this._colorsTexture.toJSON(meta);
      }
      if (this.boundingSphere !== null) {
        object.boundingSphere = this.boundingSphere.toJSON();
      }
      if (this.boundingBox !== null) {
        object.boundingBox = this.boundingBox.toJSON();
      }
    }
    function serialize(library, element) {
      if (library[element.uuid] === void 0) {
        library[element.uuid] = element.toJSON(meta);
      }
      return element.uuid;
    }
    if (this.isScene) {
      if (this.background) {
        if (this.background.isColor) {
          object.background = this.background.toJSON();
        } else if (this.background.isTexture) {
          object.background = this.background.toJSON(meta).uuid;
        }
      }
      if (this.environment && this.environment.isTexture && this.environment.isRenderTargetTexture !== true) {
        object.environment = this.environment.toJSON(meta).uuid;
      }
    } else if (this.isMesh || this.isLine || this.isPoints) {
      object.geometry = serialize(meta.geometries, this.geometry);
      const parameters = this.geometry.parameters;
      if (parameters !== void 0 && parameters.shapes !== void 0) {
        const shapes = parameters.shapes;
        if (Array.isArray(shapes)) {
          for (let i = 0, l = shapes.length; i < l; i++) {
            const shape = shapes[i];
            serialize(meta.shapes, shape);
          }
        } else {
          serialize(meta.shapes, shapes);
        }
      }
    }
    if (this.isSkinnedMesh) {
      object.bindMode = this.bindMode;
      object.bindMatrix = this.bindMatrix.toArray();
      if (this.skeleton !== void 0) {
        serialize(meta.skeletons, this.skeleton);
        object.skeleton = this.skeleton.uuid;
      }
    }
    if (this.material !== void 0) {
      if (Array.isArray(this.material)) {
        const uuids = [];
        for (let i = 0, l = this.material.length; i < l; i++) {
          uuids.push(serialize(meta.materials, this.material[i]));
        }
        object.material = uuids;
      } else {
        object.material = serialize(meta.materials, this.material);
      }
    }
    if (this.children.length > 0) {
      object.children = [];
      for (let i = 0; i < this.children.length; i++) {
        object.children.push(this.children[i].toJSON(meta).object);
      }
    }
    if (this.animations.length > 0) {
      object.animations = [];
      for (let i = 0; i < this.animations.length; i++) {
        const animation = this.animations[i];
        object.animations.push(serialize(meta.animations, animation));
      }
    }
    if (isRootObject) {
      const geometries = extractFromCache(meta.geometries);
      const materials = extractFromCache(meta.materials);
      const textures = extractFromCache(meta.textures);
      const images = extractFromCache(meta.images);
      const shapes = extractFromCache(meta.shapes);
      const skeletons = extractFromCache(meta.skeletons);
      const animations = extractFromCache(meta.animations);
      const nodes = extractFromCache(meta.nodes);
      if (geometries.length > 0) output.geometries = geometries;
      if (materials.length > 0) output.materials = materials;
      if (textures.length > 0) output.textures = textures;
      if (images.length > 0) output.images = images;
      if (shapes.length > 0) output.shapes = shapes;
      if (skeletons.length > 0) output.skeletons = skeletons;
      if (animations.length > 0) output.animations = animations;
      if (nodes.length > 0) output.nodes = nodes;
    }
    output.object = object;
    return output;
    function extractFromCache(cache) {
      const values = [];
      for (const key in cache) {
        const data = cache[key];
        delete data.metadata;
        values.push(data);
      }
      return values;
    }
  }
  /**
   * Returns a new 3D object with copied values from this instance.
   *
   * @param {boolean} [recursive=true] - When set to `true`, descendants of the 3D object are also cloned.
   * @return {Object3D} A clone of this instance.
   */
  clone(recursive) {
    return new this.constructor().copy(this, recursive);
  }
  /**
   * Copies the values of the given 3D object to this instance.
   *
   * @param {Object3D} source - The 3D object to copy.
   * @param {boolean} [recursive=true] - When set to `true`, descendants of the 3D object are cloned.
   * @return {Object3D} A reference to this instance.
   */
  copy(source, recursive = true) {
    this.name = source.name;
    this.up.copy(source.up);
    this.position.copy(source.position);
    this.rotation.order = source.rotation.order;
    this.quaternion.copy(source.quaternion);
    this.scale.copy(source.scale);
    this.matrix.copy(source.matrix);
    this.matrixWorld.copy(source.matrixWorld);
    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;
    this.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;
    this.layers.mask = source.layers.mask;
    this.visible = source.visible;
    this.castShadow = source.castShadow;
    this.receiveShadow = source.receiveShadow;
    this.frustumCulled = source.frustumCulled;
    this.renderOrder = source.renderOrder;
    this.animations = source.animations.slice();
    this.userData = JSON.parse(JSON.stringify(source.userData));
    if (recursive === true) {
      for (let i = 0; i < source.children.length; i++) {
        const child = source.children[i];
        this.add(child.clone());
      }
    }
    return this;
  }
};
Object3D.DEFAULT_UP = /* @__PURE__ */ new Vector3(0, 1, 0);
Object3D.DEFAULT_MATRIX_AUTO_UPDATE = true;
Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE = true;
var _colorKeywords = {
  "aliceblue": 15792383,
  "antiquewhite": 16444375,
  "aqua": 65535,
  "aquamarine": 8388564,
  "azure": 15794175,
  "beige": 16119260,
  "bisque": 16770244,
  "black": 0,
  "blanchedalmond": 16772045,
  "blue": 255,
  "blueviolet": 9055202,
  "brown": 10824234,
  "burlywood": 14596231,
  "cadetblue": 6266528,
  "chartreuse": 8388352,
  "chocolate": 13789470,
  "coral": 16744272,
  "cornflowerblue": 6591981,
  "cornsilk": 16775388,
  "crimson": 14423100,
  "cyan": 65535,
  "darkblue": 139,
  "darkcyan": 35723,
  "darkgoldenrod": 12092939,
  "darkgray": 11119017,
  "darkgreen": 25600,
  "darkgrey": 11119017,
  "darkkhaki": 12433259,
  "darkmagenta": 9109643,
  "darkolivegreen": 5597999,
  "darkorange": 16747520,
  "darkorchid": 10040012,
  "darkred": 9109504,
  "darksalmon": 15308410,
  "darkseagreen": 9419919,
  "darkslateblue": 4734347,
  "darkslategray": 3100495,
  "darkslategrey": 3100495,
  "darkturquoise": 52945,
  "darkviolet": 9699539,
  "deeppink": 16716947,
  "deepskyblue": 49151,
  "dimgray": 6908265,
  "dimgrey": 6908265,
  "dodgerblue": 2003199,
  "firebrick": 11674146,
  "floralwhite": 16775920,
  "forestgreen": 2263842,
  "fuchsia": 16711935,
  "gainsboro": 14474460,
  "ghostwhite": 16316671,
  "gold": 16766720,
  "goldenrod": 14329120,
  "gray": 8421504,
  "green": 32768,
  "greenyellow": 11403055,
  "grey": 8421504,
  "honeydew": 15794160,
  "hotpink": 16738740,
  "indianred": 13458524,
  "indigo": 4915330,
  "ivory": 16777200,
  "khaki": 15787660,
  "lavender": 15132410,
  "lavenderblush": 16773365,
  "lawngreen": 8190976,
  "lemonchiffon": 16775885,
  "lightblue": 11393254,
  "lightcoral": 15761536,
  "lightcyan": 14745599,
  "lightgoldenrodyellow": 16448210,
  "lightgray": 13882323,
  "lightgreen": 9498256,
  "lightgrey": 13882323,
  "lightpink": 16758465,
  "lightsalmon": 16752762,
  "lightseagreen": 2142890,
  "lightskyblue": 8900346,
  "lightslategray": 7833753,
  "lightslategrey": 7833753,
  "lightsteelblue": 11584734,
  "lightyellow": 16777184,
  "lime": 65280,
  "limegreen": 3329330,
  "linen": 16445670,
  "magenta": 16711935,
  "maroon": 8388608,
  "mediumaquamarine": 6737322,
  "mediumblue": 205,
  "mediumorchid": 12211667,
  "mediumpurple": 9662683,
  "mediumseagreen": 3978097,
  "mediumslateblue": 8087790,
  "mediumspringgreen": 64154,
  "mediumturquoise": 4772300,
  "mediumvioletred": 13047173,
  "midnightblue": 1644912,
  "mintcream": 16121850,
  "mistyrose": 16770273,
  "moccasin": 16770229,
  "navajowhite": 16768685,
  "navy": 128,
  "oldlace": 16643558,
  "olive": 8421376,
  "olivedrab": 7048739,
  "orange": 16753920,
  "orangered": 16729344,
  "orchid": 14315734,
  "palegoldenrod": 15657130,
  "palegreen": 10025880,
  "paleturquoise": 11529966,
  "palevioletred": 14381203,
  "papayawhip": 16773077,
  "peachpuff": 16767673,
  "peru": 13468991,
  "pink": 16761035,
  "plum": 14524637,
  "powderblue": 11591910,
  "purple": 8388736,
  "rebeccapurple": 6697881,
  "red": 16711680,
  "rosybrown": 12357519,
  "royalblue": 4286945,
  "saddlebrown": 9127187,
  "salmon": 16416882,
  "sandybrown": 16032864,
  "seagreen": 3050327,
  "seashell": 16774638,
  "sienna": 10506797,
  "silver": 12632256,
  "skyblue": 8900331,
  "slateblue": 6970061,
  "slategray": 7372944,
  "slategrey": 7372944,
  "snow": 16775930,
  "springgreen": 65407,
  "steelblue": 4620980,
  "tan": 13808780,
  "teal": 32896,
  "thistle": 14204888,
  "tomato": 16737095,
  "turquoise": 4251856,
  "violet": 15631086,
  "wheat": 16113331,
  "white": 16777215,
  "whitesmoke": 16119285,
  "yellow": 16776960,
  "yellowgreen": 10145074
};
var _hslA = { h: 0, s: 0, l: 0 };
var _hslB = { h: 0, s: 0, l: 0 };
function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}
var Color = class {
  /**
   * Constructs a new color.
   *
   * Note that standard method of specifying color in three.js is with a hexadecimal triplet,
   * and that method is used throughout the rest of the documentation.
   *
   * @param {(number|string|Color)} [r] - The red component of the color. If `g` and `b` are
   * not provided, it can be hexadecimal triplet, a CSS-style string or another `Color` instance.
   * @param {number} [g] - The green component.
   * @param {number} [b] - The blue component.
   */
  constructor(r, g, b) {
    this.isColor = true;
    this.r = 1;
    this.g = 1;
    this.b = 1;
    return this.set(r, g, b);
  }
  /**
   * Sets the colors's components from the given values.
   *
   * @param {(number|string|Color)} [r] - The red component of the color. If `g` and `b` are
   * not provided, it can be hexadecimal triplet, a CSS-style string or another `Color` instance.
   * @param {number} [g] - The green component.
   * @param {number} [b] - The blue component.
   * @return {Color} A reference to this color.
   */
  set(r, g, b) {
    if (g === void 0 && b === void 0) {
      const value = r;
      if (value && value.isColor) {
        this.copy(value);
      } else if (typeof value === "number") {
        this.setHex(value);
      } else if (typeof value === "string") {
        this.setStyle(value);
      }
    } else {
      this.setRGB(r, g, b);
    }
    return this;
  }
  /**
   * Sets the colors's components to the given scalar value.
   *
   * @param {number} scalar - The scalar value.
   * @return {Color} A reference to this color.
   */
  setScalar(scalar) {
    this.r = scalar;
    this.g = scalar;
    this.b = scalar;
    return this;
  }
  /**
   * Sets this color from a hexadecimal value.
   *
   * @param {number} hex - The hexadecimal value.
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setHex(hex, colorSpace = SRGBColorSpace) {
    hex = Math.floor(hex);
    this.r = (hex >> 16 & 255) / 255;
    this.g = (hex >> 8 & 255) / 255;
    this.b = (hex & 255) / 255;
    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }
  /**
   * Sets this color from RGB values.
   *
   * @param {number} r - Red channel value between `0.0` and `1.0`.
   * @param {number} g - Green channel value between `0.0` and `1.0`.
   * @param {number} b - Blue channel value between `0.0` and `1.0`.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setRGB(r, g, b, colorSpace = ColorManagement.workingColorSpace) {
    this.r = r;
    this.g = g;
    this.b = b;
    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }
  /**
   * Sets this color from RGB values.
   *
   * @param {number} h - Hue value between `0.0` and `1.0`.
   * @param {number} s - Saturation value between `0.0` and `1.0`.
   * @param {number} l - Lightness value between `0.0` and `1.0`.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setHSL(h, s, l, colorSpace = ColorManagement.workingColorSpace) {
    h = euclideanModulo(h, 1);
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    if (s === 0) {
      this.r = this.g = this.b = l;
    } else {
      const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
      const q = 2 * l - p;
      this.r = hue2rgb(q, p, h + 1 / 3);
      this.g = hue2rgb(q, p, h);
      this.b = hue2rgb(q, p, h - 1 / 3);
    }
    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }
  /**
   * Sets this color from a CSS-style string. For example, `rgb(250, 0,0)`,
   * `rgb(100%, 0%, 0%)`, `hsl(0, 100%, 50%)`, `#ff0000`, `#f00`, or `red` ( or
   * any [X11 color name](https://en.wikipedia.org/wiki/X11_color_names#Color_name_chart) -
   * all 140 color names are supported).
   *
   * @param {string} style - Color as a CSS-style string.
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setStyle(style, colorSpace = SRGBColorSpace) {
    function handleAlpha(string) {
      if (string === void 0) return;
      if (parseFloat(string) < 1) {
        warn("Color: Alpha component of " + style + " will be ignored.");
      }
    }
    let m;
    if (m = /^(\w+)\(([^\)]*)\)/.exec(style)) {
      let color;
      const name = m[1];
      const components = m[2];
      switch (name) {
        case "rgb":
        case "rgba":
          if (color = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(255, parseInt(color[1], 10)) / 255,
              Math.min(255, parseInt(color[2], 10)) / 255,
              Math.min(255, parseInt(color[3], 10)) / 255,
              colorSpace
            );
          }
          if (color = /^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(100, parseInt(color[1], 10)) / 100,
              Math.min(100, parseInt(color[2], 10)) / 100,
              Math.min(100, parseInt(color[3], 10)) / 100,
              colorSpace
            );
          }
          break;
        case "hsl":
        case "hsla":
          if (color = /^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
            handleAlpha(color[4]);
            return this.setHSL(
              parseFloat(color[1]) / 360,
              parseFloat(color[2]) / 100,
              parseFloat(color[3]) / 100,
              colorSpace
            );
          }
          break;
        default:
          warn("Color: Unknown color model " + style);
      }
    } else if (m = /^\#([A-Fa-f\d]+)$/.exec(style)) {
      const hex = m[1];
      const size = hex.length;
      if (size === 3) {
        return this.setRGB(
          parseInt(hex.charAt(0), 16) / 15,
          parseInt(hex.charAt(1), 16) / 15,
          parseInt(hex.charAt(2), 16) / 15,
          colorSpace
        );
      } else if (size === 6) {
        return this.setHex(parseInt(hex, 16), colorSpace);
      } else {
        warn("Color: Invalid hex color " + style);
      }
    } else if (style && style.length > 0) {
      return this.setColorName(style, colorSpace);
    }
    return this;
  }
  /**
   * Sets this color from a color name. Faster than {@link Color#setStyle} if
   * you don't need the other CSS-style formats.
   *
   * For convenience, the list of names is exposed in `Color.NAMES` as a hash.
   * ```js
   * Color.NAMES.aliceblue // returns 0xF0F8FF
   * ```
   *
   * @param {string} style - The color name.
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setColorName(style, colorSpace = SRGBColorSpace) {
    const hex = _colorKeywords[style.toLowerCase()];
    if (hex !== void 0) {
      this.setHex(hex, colorSpace);
    } else {
      warn("Color: Unknown color " + style);
    }
    return this;
  }
  /**
   * Returns a new color with copied values from this instance.
   *
   * @return {Color} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.r, this.g, this.b);
  }
  /**
   * Copies the values of the given color to this instance.
   *
   * @param {Color} color - The color to copy.
   * @return {Color} A reference to this color.
   */
  copy(color) {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
    return this;
  }
  /**
   * Copies the given color into this color, and then converts this color from
   * `SRGBColorSpace` to `LinearSRGBColorSpace`.
   *
   * @param {Color} color - The color to copy/convert.
   * @return {Color} A reference to this color.
   */
  copySRGBToLinear(color) {
    this.r = SRGBToLinear(color.r);
    this.g = SRGBToLinear(color.g);
    this.b = SRGBToLinear(color.b);
    return this;
  }
  /**
   * Copies the given color into this color, and then converts this color from
   * `LinearSRGBColorSpace` to `SRGBColorSpace`.
   *
   * @param {Color} color - The color to copy/convert.
   * @return {Color} A reference to this color.
   */
  copyLinearToSRGB(color) {
    this.r = LinearToSRGB(color.r);
    this.g = LinearToSRGB(color.g);
    this.b = LinearToSRGB(color.b);
    return this;
  }
  /**
   * Converts this color from `SRGBColorSpace` to `LinearSRGBColorSpace`.
   *
   * @return {Color} A reference to this color.
   */
  convertSRGBToLinear() {
    this.copySRGBToLinear(this);
    return this;
  }
  /**
   * Converts this color from `LinearSRGBColorSpace` to `SRGBColorSpace`.
   *
   * @return {Color} A reference to this color.
   */
  convertLinearToSRGB() {
    this.copyLinearToSRGB(this);
    return this;
  }
  /**
   * Returns the hexadecimal value of this color.
   *
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {number} The hexadecimal value.
   */
  getHex(colorSpace = SRGBColorSpace) {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);
    return Math.round(clamp(_color.r * 255, 0, 255)) * 65536 + Math.round(clamp(_color.g * 255, 0, 255)) * 256 + Math.round(clamp(_color.b * 255, 0, 255));
  }
  /**
   * Returns the hexadecimal value of this color as a string (for example, 'FFFFFF').
   *
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {string} The hexadecimal value as a string.
   */
  getHexString(colorSpace = SRGBColorSpace) {
    return ("000000" + this.getHex(colorSpace).toString(16)).slice(-6);
  }
  /**
   * Converts the colors RGB values into the HSL format and stores them into the
   * given target object.
   *
   * @param {{h:number,s:number,l:number}} target - The target object that is used to store the method's result.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {{h:number,s:number,l:number}} The HSL representation of this color.
   */
  getHSL(target, colorSpace = ColorManagement.workingColorSpace) {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);
    const r = _color.r, g = _color.g, b = _color.b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hue, saturation;
    const lightness = (min + max) / 2;
    if (min === max) {
      hue = 0;
      saturation = 0;
    } else {
      const delta = max - min;
      saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
      switch (max) {
        case r:
          hue = (g - b) / delta + (g < b ? 6 : 0);
          break;
        case g:
          hue = (b - r) / delta + 2;
          break;
        case b:
          hue = (r - g) / delta + 4;
          break;
      }
      hue /= 6;
    }
    target.h = hue;
    target.s = saturation;
    target.l = lightness;
    return target;
  }
  /**
   * Returns the RGB values of this color and stores them into the given target object.
   *
   * @param {Color} target - The target color that is used to store the method's result.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {Color} The RGB representation of this color.
   */
  getRGB(target, colorSpace = ColorManagement.workingColorSpace) {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);
    target.r = _color.r;
    target.g = _color.g;
    target.b = _color.b;
    return target;
  }
  /**
   * Returns the value of this color as a CSS style string. Example: `rgb(255,0,0)`.
   *
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {string} The CSS representation of this color.
   */
  getStyle(colorSpace = SRGBColorSpace) {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);
    const r = _color.r, g = _color.g, b = _color.b;
    if (colorSpace !== SRGBColorSpace) {
      return `color(${colorSpace} ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)})`;
    }
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }
  /**
   * Adds the given HSL values to this color's values.
   * Internally, this converts the color's RGB values to HSL, adds HSL
   * and then converts the color back to RGB.
   *
   * @param {number} h - Hue value between `0.0` and `1.0`.
   * @param {number} s - Saturation value between `0.0` and `1.0`.
   * @param {number} l - Lightness value between `0.0` and `1.0`.
   * @return {Color} A reference to this color.
   */
  offsetHSL(h, s, l) {
    this.getHSL(_hslA);
    return this.setHSL(_hslA.h + h, _hslA.s + s, _hslA.l + l);
  }
  /**
   * Adds the RGB values of the given color to the RGB values of this color.
   *
   * @param {Color} color - The color to add.
   * @return {Color} A reference to this color.
   */
  add(color) {
    this.r += color.r;
    this.g += color.g;
    this.b += color.b;
    return this;
  }
  /**
   * Adds the RGB values of the given colors and stores the result in this instance.
   *
   * @param {Color} color1 - The first color.
   * @param {Color} color2 - The second color.
   * @return {Color} A reference to this color.
   */
  addColors(color1, color2) {
    this.r = color1.r + color2.r;
    this.g = color1.g + color2.g;
    this.b = color1.b + color2.b;
    return this;
  }
  /**
   * Adds the given scalar value to the RGB values of this color.
   *
   * @param {number} s - The scalar to add.
   * @return {Color} A reference to this color.
   */
  addScalar(s) {
    this.r += s;
    this.g += s;
    this.b += s;
    return this;
  }
  /**
   * Subtracts the RGB values of the given color from the RGB values of this color.
   *
   * @param {Color} color - The color to subtract.
   * @return {Color} A reference to this color.
   */
  sub(color) {
    this.r = Math.max(0, this.r - color.r);
    this.g = Math.max(0, this.g - color.g);
    this.b = Math.max(0, this.b - color.b);
    return this;
  }
  /**
   * Multiplies the RGB values of the given color with the RGB values of this color.
   *
   * @param {Color} color - The color to multiply.
   * @return {Color} A reference to this color.
   */
  multiply(color) {
    this.r *= color.r;
    this.g *= color.g;
    this.b *= color.b;
    return this;
  }
  /**
   * Multiplies the given scalar value with the RGB values of this color.
   *
   * @param {number} s - The scalar to multiply.
   * @return {Color} A reference to this color.
   */
  multiplyScalar(s) {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }
  /**
   * Linearly interpolates this color's RGB values toward the RGB values of the
   * given color. The alpha argument can be thought of as the ratio between
   * the two colors, where `0.0` is this color and `1.0` is the first argument.
   *
   * @param {Color} color - The color to converge on.
   * @param {number} alpha - The interpolation factor in the closed interval `[0,1]`.
   * @return {Color} A reference to this color.
   */
  lerp(color, alpha) {
    this.r += (color.r - this.r) * alpha;
    this.g += (color.g - this.g) * alpha;
    this.b += (color.b - this.b) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given colors and stores the result in this instance.
   * The alpha argument can be thought of as the ratio between the two colors, where `0.0`
   * is the first and `1.0` is the second color.
   *
   * @param {Color} color1 - The first color.
   * @param {Color} color2 - The second color.
   * @param {number} alpha - The interpolation factor in the closed interval `[0,1]`.
   * @return {Color} A reference to this color.
   */
  lerpColors(color1, color2, alpha) {
    this.r = color1.r + (color2.r - color1.r) * alpha;
    this.g = color1.g + (color2.g - color1.g) * alpha;
    this.b = color1.b + (color2.b - color1.b) * alpha;
    return this;
  }
  /**
   * Linearly interpolates this color's HSL values toward the HSL values of the
   * given color. It differs from {@link Color#lerp} by not interpolating straight
   * from one color to the other, but instead going through all the hues in between
   * those two colors. The alpha argument can be thought of as the ratio between
   * the two colors, where 0.0 is this color and 1.0 is the first argument.
   *
   * @param {Color} color - The color to converge on.
   * @param {number} alpha - The interpolation factor in the closed interval `[0,1]`.
   * @return {Color} A reference to this color.
   */
  lerpHSL(color, alpha) {
    this.getHSL(_hslA);
    color.getHSL(_hslB);
    const h = lerp(_hslA.h, _hslB.h, alpha);
    const s = lerp(_hslA.s, _hslB.s, alpha);
    const l = lerp(_hslA.l, _hslB.l, alpha);
    this.setHSL(h, s, l);
    return this;
  }
  /**
   * Sets the color's RGB components from the given 3D vector.
   *
   * @param {Vector3} v - The vector to set.
   * @return {Color} A reference to this color.
   */
  setFromVector3(v) {
    this.r = v.x;
    this.g = v.y;
    this.b = v.z;
    return this;
  }
  /**
   * Transforms this color with the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix.
   * @return {Color} A reference to this color.
   */
  applyMatrix3(m) {
    const r = this.r, g = this.g, b = this.b;
    const e = m.elements;
    this.r = e[0] * r + e[3] * g + e[6] * b;
    this.g = e[1] * r + e[4] * g + e[7] * b;
    this.b = e[2] * r + e[5] * g + e[8] * b;
    return this;
  }
  /**
   * Returns `true` if this color is equal with the given one.
   *
   * @param {Color} c - The color to test for equality.
   * @return {boolean} Whether this bounding color is equal with the given one.
   */
  equals(c) {
    return c.r === this.r && c.g === this.g && c.b === this.b;
  }
  /**
   * Sets this color's RGB components from the given array.
   *
   * @param {Array<number>} array - An array holding the RGB values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Color} A reference to this color.
   */
  fromArray(array, offset = 0) {
    this.r = array[offset];
    this.g = array[offset + 1];
    this.b = array[offset + 2];
    return this;
  }
  /**
   * Writes the RGB components of this color to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the color components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The color components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;
    return array;
  }
  /**
   * Sets the components of this color from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding color data.
   * @param {number} index - The index into the attribute.
   * @return {Color} A reference to this color.
   */
  fromBufferAttribute(attribute, index) {
    this.r = attribute.getX(index);
    this.g = attribute.getY(index);
    this.b = attribute.getZ(index);
    return this;
  }
  /**
   * This methods defines the serialization result of this class. Returns the color
   * as a hexadecimal value.
   *
   * @return {number} The hexadecimal value.
   */
  toJSON() {
    return this.getHex();
  }
  *[Symbol.iterator]() {
    yield this.r;
    yield this.g;
    yield this.b;
  }
};
var _color = /* @__PURE__ */ new Color();
Color.NAMES = _colorKeywords;
function cloneUniforms(src) {
  const dst = {};
  for (const u in src) {
    dst[u] = {};
    for (const p in src[u]) {
      const property = src[u][p];
      if (property && (property.isColor || property.isMatrix3 || property.isMatrix4 || property.isVector2 || property.isVector3 || property.isVector4 || property.isTexture || property.isQuaternion)) {
        if (property.isRenderTargetTexture) {
          warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().");
          dst[u][p] = null;
        } else {
          dst[u][p] = property.clone();
        }
      } else if (Array.isArray(property)) {
        dst[u][p] = property.slice();
      } else {
        dst[u][p] = property;
      }
    }
  }
  return dst;
}
function mergeUniforms(uniforms) {
  const merged = {};
  for (let u = 0; u < uniforms.length; u++) {
    const tmp = cloneUniforms(uniforms[u]);
    for (const p in tmp) {
      merged[p] = tmp[p];
    }
  }
  return merged;
}
function convertArray(array, type) {
  if (!array || array.constructor === type) return array;
  if (typeof type.BYTES_PER_ELEMENT === "number") {
    return new type(array);
  }
  return Array.prototype.slice.call(array);
}
var Interpolant = class {
  /**
   * Constructs a new interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    this.parameterPositions = parameterPositions;
    this._cachedIndex = 0;
    this.resultBuffer = resultBuffer !== void 0 ? resultBuffer : new sampleValues.constructor(sampleSize);
    this.sampleValues = sampleValues;
    this.valueSize = sampleSize;
    this.settings = null;
    this.DefaultSettings_ = {};
  }
  /**
   * Evaluate the interpolant at position `t`.
   *
   * @param {number} t - The interpolation factor.
   * @return {TypedArray} The result buffer.
   */
  evaluate(t) {
    const pp = this.parameterPositions;
    let i1 = this._cachedIndex, t1 = pp[i1], t0 = pp[i1 - 1];
    validate_interval: {
      seek: {
        let right;
        linear_scan: {
          forward_scan: if (!(t < t1)) {
            for (let giveUpAt = i1 + 2; ; ) {
              if (t1 === void 0) {
                if (t < t0) break forward_scan;
                i1 = pp.length;
                this._cachedIndex = i1;
                return this.copySampleValue_(i1 - 1);
              }
              if (i1 === giveUpAt) break;
              t0 = t1;
              t1 = pp[++i1];
              if (t < t1) {
                break seek;
              }
            }
            right = pp.length;
            break linear_scan;
          }
          if (!(t >= t0)) {
            const t1global = pp[1];
            if (t < t1global) {
              i1 = 2;
              t0 = t1global;
            }
            for (let giveUpAt = i1 - 2; ; ) {
              if (t0 === void 0) {
                this._cachedIndex = 0;
                return this.copySampleValue_(0);
              }
              if (i1 === giveUpAt) break;
              t1 = t0;
              t0 = pp[--i1 - 1];
              if (t >= t0) {
                break seek;
              }
            }
            right = i1;
            i1 = 0;
            break linear_scan;
          }
          break validate_interval;
        }
        while (i1 < right) {
          const mid = i1 + right >>> 1;
          if (t < pp[mid]) {
            right = mid;
          } else {
            i1 = mid + 1;
          }
        }
        t1 = pp[i1];
        t0 = pp[i1 - 1];
        if (t0 === void 0) {
          this._cachedIndex = 0;
          return this.copySampleValue_(0);
        }
        if (t1 === void 0) {
          i1 = pp.length;
          this._cachedIndex = i1;
          return this.copySampleValue_(i1 - 1);
        }
      }
      this._cachedIndex = i1;
      this.intervalChanged_(i1, t0, t1);
    }
    return this.interpolate_(i1, t0, t, t1);
  }
  /**
   * Returns the interpolation settings.
   *
   * @return {Object} The interpolation settings.
   */
  getSettings_() {
    return this.settings || this.DefaultSettings_;
  }
  /**
   * Copies a sample value to the result buffer.
   *
   * @param {number} index - An index into the sample value buffer.
   * @return {TypedArray} The result buffer.
   */
  copySampleValue_(index) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, offset = index * stride;
    for (let i = 0; i !== stride; ++i) {
      result[i] = values[offset + i];
    }
    return result;
  }
  /**
   * Copies a sample value to the result buffer.
   *
   * @abstract
   * @param {number} i1 - An index into the sample value buffer.
   * @param {number} t0 - The previous interpolation factor.
   * @param {number} t - The current interpolation factor.
   * @param {number} t1 - The next interpolation factor.
   * @return {TypedArray} The result buffer.
   */
  interpolate_() {
    throw new Error("call to abstract method");
  }
  /**
   * Optional method that is executed when the interval has changed.
   *
   * @param {number} i1 - An index into the sample value buffer.
   * @param {number} t0 - The previous interpolation factor.
   * @param {number} t - The current interpolation factor.
   */
  intervalChanged_() {
  }
};
var CubicInterpolant = class extends Interpolant {
  /**
   * Constructs a new cubic interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
    this._weightPrev = -0;
    this._offsetPrev = -0;
    this._weightNext = -0;
    this._offsetNext = -0;
    this.DefaultSettings_ = {
      endingStart: ZeroCurvatureEnding,
      endingEnd: ZeroCurvatureEnding
    };
  }
  intervalChanged_(i1, t0, t1) {
    const pp = this.parameterPositions;
    let iPrev = i1 - 2, iNext = i1 + 1, tPrev = pp[iPrev], tNext = pp[iNext];
    if (tPrev === void 0) {
      switch (this.getSettings_().endingStart) {
        case ZeroSlopeEnding:
          iPrev = i1;
          tPrev = 2 * t0 - t1;
          break;
        case WrapAroundEnding:
          iPrev = pp.length - 2;
          tPrev = t0 + pp[iPrev] - pp[iPrev + 1];
          break;
        default:
          iPrev = i1;
          tPrev = t1;
      }
    }
    if (tNext === void 0) {
      switch (this.getSettings_().endingEnd) {
        case ZeroSlopeEnding:
          iNext = i1;
          tNext = 2 * t1 - t0;
          break;
        case WrapAroundEnding:
          iNext = 1;
          tNext = t1 + pp[1] - pp[0];
          break;
        default:
          iNext = i1 - 1;
          tNext = t0;
      }
    }
    const halfDt = (t1 - t0) * 0.5, stride = this.valueSize;
    this._weightPrev = halfDt / (t0 - tPrev);
    this._weightNext = halfDt / (tNext - t1);
    this._offsetPrev = iPrev * stride;
    this._offsetNext = iNext * stride;
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, o1 = i1 * stride, o0 = o1 - stride, oP = this._offsetPrev, oN = this._offsetNext, wP = this._weightPrev, wN = this._weightNext, p = (t - t0) / (t1 - t0), pp = p * p, ppp = pp * p;
    const sP = -wP * ppp + 2 * wP * pp - wP * p;
    const s0 = (1 + wP) * ppp + (-1.5 - 2 * wP) * pp + (-0.5 + wP) * p + 1;
    const s1 = (-1 - wN) * ppp + (1.5 + wN) * pp + 0.5 * p;
    const sN = wN * ppp - wN * pp;
    for (let i = 0; i !== stride; ++i) {
      result[i] = sP * values[oP + i] + s0 * values[o0 + i] + s1 * values[o1 + i] + sN * values[oN + i];
    }
    return result;
  }
};
var LinearInterpolant = class extends Interpolant {
  /**
   * Constructs a new linear interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, offset1 = i1 * stride, offset0 = offset1 - stride, weight1 = (t - t0) / (t1 - t0), weight0 = 1 - weight1;
    for (let i = 0; i !== stride; ++i) {
      result[i] = values[offset0 + i] * weight0 + values[offset1 + i] * weight1;
    }
    return result;
  }
};
var DiscreteInterpolant = class extends Interpolant {
  /**
   * Constructs a new discrete interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  interpolate_(i1) {
    return this.copySampleValue_(i1 - 1);
  }
};
var KeyframeTrack = class {
  /**
   * Constructs a new keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number|string|boolean>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    if (name === void 0) throw new Error("THREE.KeyframeTrack: track name is undefined");
    if (times === void 0 || times.length === 0) throw new Error("THREE.KeyframeTrack: no keyframes in track named " + name);
    this.name = name;
    this.times = convertArray(times, this.TimeBufferType);
    this.values = convertArray(values, this.ValueBufferType);
    this.setInterpolation(interpolation || this.DefaultInterpolation);
  }
  /**
   * Converts the keyframe track to JSON.
   *
   * @static
   * @param {KeyframeTrack} track - The keyframe track to serialize.
   * @return {Object} The serialized keyframe track as JSON.
   */
  static toJSON(track) {
    const trackType = track.constructor;
    let json;
    if (trackType.toJSON !== this.toJSON) {
      json = trackType.toJSON(track);
    } else {
      json = {
        "name": track.name,
        "times": convertArray(track.times, Array),
        "values": convertArray(track.values, Array)
      };
      const interpolation = track.getInterpolation();
      if (interpolation !== track.DefaultInterpolation) {
        json.interpolation = interpolation;
      }
    }
    json.type = track.ValueTypeName;
    return json;
  }
  /**
   * Factory method for creating a new discrete interpolant.
   *
   * @static
   * @param {TypedArray} [result] - The result buffer.
   * @return {DiscreteInterpolant} The new interpolant.
   */
  InterpolantFactoryMethodDiscrete(result) {
    return new DiscreteInterpolant(this.times, this.values, this.getValueSize(), result);
  }
  /**
   * Factory method for creating a new linear interpolant.
   *
   * @static
   * @param {TypedArray} [result] - The result buffer.
   * @return {LinearInterpolant} The new interpolant.
   */
  InterpolantFactoryMethodLinear(result) {
    return new LinearInterpolant(this.times, this.values, this.getValueSize(), result);
  }
  /**
   * Factory method for creating a new smooth interpolant.
   *
   * @static
   * @param {TypedArray} [result] - The result buffer.
   * @return {CubicInterpolant} The new interpolant.
   */
  InterpolantFactoryMethodSmooth(result) {
    return new CubicInterpolant(this.times, this.values, this.getValueSize(), result);
  }
  /**
   * Defines the interpolation factor method for this keyframe track.
   *
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} interpolation - The interpolation type.
   * @return {KeyframeTrack} A reference to this keyframe track.
   */
  setInterpolation(interpolation) {
    let factoryMethod;
    switch (interpolation) {
      case InterpolateDiscrete:
        factoryMethod = this.InterpolantFactoryMethodDiscrete;
        break;
      case InterpolateLinear:
        factoryMethod = this.InterpolantFactoryMethodLinear;
        break;
      case InterpolateSmooth:
        factoryMethod = this.InterpolantFactoryMethodSmooth;
        break;
    }
    if (factoryMethod === void 0) {
      const message = "unsupported interpolation for " + this.ValueTypeName + " keyframe track named " + this.name;
      if (this.createInterpolant === void 0) {
        if (interpolation !== this.DefaultInterpolation) {
          this.setInterpolation(this.DefaultInterpolation);
        } else {
          throw new Error(message);
        }
      }
      warn("KeyframeTrack:", message);
      return this;
    }
    this.createInterpolant = factoryMethod;
    return this;
  }
  /**
   * Returns the current interpolation type.
   *
   * @return {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} The interpolation type.
   */
  getInterpolation() {
    switch (this.createInterpolant) {
      case this.InterpolantFactoryMethodDiscrete:
        return InterpolateDiscrete;
      case this.InterpolantFactoryMethodLinear:
        return InterpolateLinear;
      case this.InterpolantFactoryMethodSmooth:
        return InterpolateSmooth;
    }
  }
  /**
   * Returns the value size.
   *
   * @return {number} The value size.
   */
  getValueSize() {
    return this.values.length / this.times.length;
  }
  /**
   * Moves all keyframes either forward or backward in time.
   *
   * @param {number} timeOffset - The offset to move the time values.
   * @return {KeyframeTrack} A reference to this keyframe track.
   */
  shift(timeOffset) {
    if (timeOffset !== 0) {
      const times = this.times;
      for (let i = 0, n = times.length; i !== n; ++i) {
        times[i] += timeOffset;
      }
    }
    return this;
  }
  /**
   * Scale all keyframe times by a factor (useful for frame - seconds conversions).
   *
   * @param {number} timeScale - The time scale.
   * @return {KeyframeTrack} A reference to this keyframe track.
   */
  scale(timeScale) {
    if (timeScale !== 1) {
      const times = this.times;
      for (let i = 0, n = times.length; i !== n; ++i) {
        times[i] *= timeScale;
      }
    }
    return this;
  }
  /**
   * Removes keyframes before and after animation without changing any values within the defined time range.
   *
   * Note: The method does not shift around keys to the start of the track time, because for interpolated
   * keys this will change their values
   *
   * @param {number} startTime - The start time.
   * @param {number} endTime - The end time.
   * @return {KeyframeTrack} A reference to this keyframe track.
   */
  trim(startTime, endTime) {
    const times = this.times, nKeys = times.length;
    let from = 0, to = nKeys - 1;
    while (from !== nKeys && times[from] < startTime) {
      ++from;
    }
    while (to !== -1 && times[to] > endTime) {
      --to;
    }
    ++to;
    if (from !== 0 || to !== nKeys) {
      if (from >= to) {
        to = Math.max(to, 1);
        from = to - 1;
      }
      const stride = this.getValueSize();
      this.times = times.slice(from, to);
      this.values = this.values.slice(from * stride, to * stride);
    }
    return this;
  }
  /**
   * Performs minimal validation on the keyframe track. Returns `true` if the values
   * are valid.
   *
   * @return {boolean} Whether the keyframes are valid or not.
   */
  validate() {
    let valid = true;
    const valueSize = this.getValueSize();
    if (valueSize - Math.floor(valueSize) !== 0) {
      error("KeyframeTrack: Invalid value size in track.", this);
      valid = false;
    }
    const times = this.times, values = this.values, nKeys = times.length;
    if (nKeys === 0) {
      error("KeyframeTrack: Track is empty.", this);
      valid = false;
    }
    let prevTime = null;
    for (let i = 0; i !== nKeys; i++) {
      const currTime = times[i];
      if (typeof currTime === "number" && isNaN(currTime)) {
        error("KeyframeTrack: Time is not a valid number.", this, i, currTime);
        valid = false;
        break;
      }
      if (prevTime !== null && prevTime > currTime) {
        error("KeyframeTrack: Out of order keys.", this, i, currTime, prevTime);
        valid = false;
        break;
      }
      prevTime = currTime;
    }
    if (values !== void 0) {
      if (isTypedArray(values)) {
        for (let i = 0, n = values.length; i !== n; ++i) {
          const value = values[i];
          if (isNaN(value)) {
            error("KeyframeTrack: Value is not a valid number.", this, i, value);
            valid = false;
            break;
          }
        }
      }
    }
    return valid;
  }
  /**
   * Optimizes this keyframe track by removing equivalent sequential keys (which are
   * common in morph target sequences).
   *
   * @return {AnimationClip} A reference to this animation clip.
   */
  optimize() {
    const times = this.times.slice(), values = this.values.slice(), stride = this.getValueSize(), smoothInterpolation = this.getInterpolation() === InterpolateSmooth, lastIndex = times.length - 1;
    let writeIndex = 1;
    for (let i = 1; i < lastIndex; ++i) {
      let keep = false;
      const time = times[i];
      const timeNext = times[i + 1];
      if (time !== timeNext && (i !== 1 || time !== times[0])) {
        if (!smoothInterpolation) {
          const offset = i * stride, offsetP = offset - stride, offsetN = offset + stride;
          for (let j = 0; j !== stride; ++j) {
            const value = values[offset + j];
            if (value !== values[offsetP + j] || value !== values[offsetN + j]) {
              keep = true;
              break;
            }
          }
        } else {
          keep = true;
        }
      }
      if (keep) {
        if (i !== writeIndex) {
          times[writeIndex] = times[i];
          const readOffset = i * stride, writeOffset = writeIndex * stride;
          for (let j = 0; j !== stride; ++j) {
            values[writeOffset + j] = values[readOffset + j];
          }
        }
        ++writeIndex;
      }
    }
    if (lastIndex > 0) {
      times[writeIndex] = times[lastIndex];
      for (let readOffset = lastIndex * stride, writeOffset = writeIndex * stride, j = 0; j !== stride; ++j) {
        values[writeOffset + j] = values[readOffset + j];
      }
      ++writeIndex;
    }
    if (writeIndex !== times.length) {
      this.times = times.slice(0, writeIndex);
      this.values = values.slice(0, writeIndex * stride);
    } else {
      this.times = times;
      this.values = values;
    }
    return this;
  }
  /**
   * Returns a new keyframe track with copied values from this instance.
   *
   * @return {KeyframeTrack} A clone of this instance.
   */
  clone() {
    const times = this.times.slice();
    const values = this.values.slice();
    const TypedKeyframeTrack = this.constructor;
    const track = new TypedKeyframeTrack(this.name, times, values);
    track.createInterpolant = this.createInterpolant;
    return track;
  }
};
KeyframeTrack.prototype.ValueTypeName = "";
KeyframeTrack.prototype.TimeBufferType = Float32Array;
KeyframeTrack.prototype.ValueBufferType = Float32Array;
KeyframeTrack.prototype.DefaultInterpolation = InterpolateLinear;
var BooleanKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new boolean keyframe track.
   *
   * This keyframe track type has no `interpolation` parameter because the
   * interpolation is always discrete.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<boolean>} values - A list of keyframe values.
   */
  constructor(name, times, values) {
    super(name, times, values);
  }
};
BooleanKeyframeTrack.prototype.ValueTypeName = "bool";
BooleanKeyframeTrack.prototype.ValueBufferType = Array;
BooleanKeyframeTrack.prototype.DefaultInterpolation = InterpolateDiscrete;
BooleanKeyframeTrack.prototype.InterpolantFactoryMethodLinear = void 0;
BooleanKeyframeTrack.prototype.InterpolantFactoryMethodSmooth = void 0;
var ColorKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new color keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    super(name, times, values, interpolation);
  }
};
ColorKeyframeTrack.prototype.ValueTypeName = "color";
var NumberKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new number keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    super(name, times, values, interpolation);
  }
};
NumberKeyframeTrack.prototype.ValueTypeName = "number";
var QuaternionLinearInterpolant = class extends Interpolant {
  /**
   * Constructs a new SLERP interpolant.
   *
   * @param {TypedArray} parameterPositions - The parameter positions hold the interpolation factors.
   * @param {TypedArray} sampleValues - The sample values.
   * @param {number} sampleSize - The sample size
   * @param {TypedArray} [resultBuffer] - The result buffer.
   */
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer, values = this.sampleValues, stride = this.valueSize, alpha = (t - t0) / (t1 - t0);
    let offset = i1 * stride;
    for (let end = offset + stride; offset !== end; offset += 4) {
      Quaternion.slerpFlat(result, 0, values, offset - stride, values, offset, alpha);
    }
    return result;
  }
};
var QuaternionKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new Quaternion keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    super(name, times, values, interpolation);
  }
  /**
   * Overwritten so the method returns Quaternion based interpolant.
   *
   * @static
   * @param {TypedArray} [result] - The result buffer.
   * @return {QuaternionLinearInterpolant} The new interpolant.
   */
  InterpolantFactoryMethodLinear(result) {
    return new QuaternionLinearInterpolant(this.times, this.values, this.getValueSize(), result);
  }
};
QuaternionKeyframeTrack.prototype.ValueTypeName = "quaternion";
QuaternionKeyframeTrack.prototype.InterpolantFactoryMethodSmooth = void 0;
var StringKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new string keyframe track.
   *
   * This keyframe track type has no `interpolation` parameter because the
   * interpolation is always discrete.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<string>} values - A list of keyframe values.
   */
  constructor(name, times, values) {
    super(name, times, values);
  }
};
StringKeyframeTrack.prototype.ValueTypeName = "string";
StringKeyframeTrack.prototype.ValueBufferType = Array;
StringKeyframeTrack.prototype.DefaultInterpolation = InterpolateDiscrete;
StringKeyframeTrack.prototype.InterpolantFactoryMethodLinear = void 0;
StringKeyframeTrack.prototype.InterpolantFactoryMethodSmooth = void 0;
var VectorKeyframeTrack = class extends KeyframeTrack {
  /**
   * Constructs a new vector keyframe track.
   *
   * @param {string} name - The keyframe track's name.
   * @param {Array<number>} times - A list of keyframe times.
   * @param {Array<number>} values - A list of keyframe values.
   * @param {(InterpolateLinear|InterpolateDiscrete|InterpolateSmooth)} [interpolation] - The interpolation type.
   */
  constructor(name, times, values, interpolation) {
    super(name, times, values, interpolation);
  }
};
VectorKeyframeTrack.prototype.ValueTypeName = "vector";
var LoadingManager = class {
  /**
   * Constructs a new loading manager.
   *
   * @param {Function} [onLoad] - Executes when all items have been loaded.
   * @param {Function} [onProgress] - Executes when single items have been loaded.
   * @param {Function} [onError] - Executes when an error occurs.
   */
  constructor(onLoad, onProgress, onError) {
    const scope = this;
    let isLoading = false;
    let itemsLoaded = 0;
    let itemsTotal = 0;
    let urlModifier = void 0;
    const handlers = [];
    this.onStart = void 0;
    this.onLoad = onLoad;
    this.onProgress = onProgress;
    this.onError = onError;
    this._abortController = null;
    this.itemStart = function(url) {
      itemsTotal++;
      if (isLoading === false) {
        if (scope.onStart !== void 0) {
          scope.onStart(url, itemsLoaded, itemsTotal);
        }
      }
      isLoading = true;
    };
    this.itemEnd = function(url) {
      itemsLoaded++;
      if (scope.onProgress !== void 0) {
        scope.onProgress(url, itemsLoaded, itemsTotal);
      }
      if (itemsLoaded === itemsTotal) {
        isLoading = false;
        if (scope.onLoad !== void 0) {
          scope.onLoad();
        }
      }
    };
    this.itemError = function(url) {
      if (scope.onError !== void 0) {
        scope.onError(url);
      }
    };
    this.resolveURL = function(url) {
      if (urlModifier) {
        return urlModifier(url);
      }
      return url;
    };
    this.setURLModifier = function(transform) {
      urlModifier = transform;
      return this;
    };
    this.addHandler = function(regex, loader) {
      handlers.push(regex, loader);
      return this;
    };
    this.removeHandler = function(regex) {
      const index = handlers.indexOf(regex);
      if (index !== -1) {
        handlers.splice(index, 2);
      }
      return this;
    };
    this.getHandler = function(file) {
      for (let i = 0, l = handlers.length; i < l; i += 2) {
        const regex = handlers[i];
        const loader = handlers[i + 1];
        if (regex.global) regex.lastIndex = 0;
        if (regex.test(file)) {
          return loader;
        }
      }
      return null;
    };
    this.abort = function() {
      this.abortController.abort();
      this._abortController = null;
      return this;
    };
  }
  // TODO: Revert this back to a single member variable once this issue has been fixed
  // https://github.com/cloudflare/workerd/issues/3657
  /**
   * Used for aborting ongoing requests in loaders using this manager.
   *
   * @type {AbortController}
   */
  get abortController() {
    if (!this._abortController) {
      this._abortController = new AbortController();
    }
    return this._abortController;
  }
};
var DefaultLoadingManager = /* @__PURE__ */ new LoadingManager();
var Loader = class {
  /**
   * Constructs a new loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    this.manager = manager !== void 0 ? manager : DefaultLoadingManager;
    this.crossOrigin = "anonymous";
    this.withCredentials = false;
    this.path = "";
    this.resourcePath = "";
    this.requestHeader = {};
  }
  /**
   * This method needs to be implemented by all concrete loaders. It holds the
   * logic for loading assets from the backend.
   *
   * @abstract
   * @param {string} url - The path/URL of the file to be loaded.
   * @param {Function} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} [onProgress] - Executed while the loading is in progress.
   * @param {onErrorCallback} [onError] - Executed when errors occur.
   */
  load() {
  }
  /**
   * A async version of {@link Loader#load}.
   *
   * @param {string} url - The path/URL of the file to be loaded.
   * @param {onProgressCallback} [onProgress] - Executed while the loading is in progress.
   * @return {Promise} A Promise that resolves when the asset has been loaded.
   */
  loadAsync(url, onProgress) {
    const scope = this;
    return new Promise(function(resolve, reject) {
      scope.load(url, resolve, onProgress, reject);
    });
  }
  /**
   * This method needs to be implemented by all concrete loaders. It holds the
   * logic for parsing the asset into three.js entities.
   *
   * @abstract
   * @param {any} data - The data to parse.
   */
  parse() {
  }
  /**
   * Sets the `crossOrigin` String to implement CORS for loading the URL
   * from a different domain that allows CORS.
   *
   * @param {string} crossOrigin - The `crossOrigin` value.
   * @return {Loader} A reference to this instance.
   */
  setCrossOrigin(crossOrigin) {
    this.crossOrigin = crossOrigin;
    return this;
  }
  /**
   * Whether the XMLHttpRequest uses credentials such as cookies, authorization
   * headers or TLS client certificates, see [XMLHttpRequest.withCredentials](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials).
   *
   * Note: This setting has no effect if you are loading files locally or from the same domain.
   *
   * @param {boolean} value - The `withCredentials` value.
   * @return {Loader} A reference to this instance.
   */
  setWithCredentials(value) {
    this.withCredentials = value;
    return this;
  }
  /**
   * Sets the base path for the asset.
   *
   * @param {string} path - The base path.
   * @return {Loader} A reference to this instance.
   */
  setPath(path) {
    this.path = path;
    return this;
  }
  /**
   * Sets the base path for dependent resources like textures.
   *
   * @param {string} resourcePath - The resource path.
   * @return {Loader} A reference to this instance.
   */
  setResourcePath(resourcePath) {
    this.resourcePath = resourcePath;
    return this;
  }
  /**
   * Sets the given request header.
   *
   * @param {Object} requestHeader - A [request header](https://developer.mozilla.org/en-US/docs/Glossary/Request_header)
   * for configuring the HTTP request.
   * @return {Loader} A reference to this instance.
   */
  setRequestHeader(requestHeader) {
    this.requestHeader = requestHeader;
    return this;
  }
  /**
   * This method can be implemented in loaders for aborting ongoing requests.
   *
   * @abstract
   * @return {Loader} A reference to this instance.
   */
  abort() {
    return this;
  }
};
Loader.DEFAULT_MATERIAL_NAME = "__DEFAULT";
var _RESERVED_CHARS_RE = "\\[\\]\\.:\\/";
var _reservedRe = new RegExp("[" + _RESERVED_CHARS_RE + "]", "g");
var _wordChar = "[^" + _RESERVED_CHARS_RE + "]";
var _wordCharOrDot = "[^" + _RESERVED_CHARS_RE.replace("\\.", "") + "]";
var _directoryRe = /* @__PURE__ */ /((?:WC+[\/:])*)/.source.replace("WC", _wordChar);
var _nodeRe = /* @__PURE__ */ /(WCOD+)?/.source.replace("WCOD", _wordCharOrDot);
var _objectRe = /* @__PURE__ */ /(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC", _wordChar);
var _propertyRe = /* @__PURE__ */ /\.(WC+)(?:\[(.+)\])?/.source.replace("WC", _wordChar);
var _trackRe = new RegExp(
  "^" + _directoryRe + _nodeRe + _objectRe + _propertyRe + "$"
);
var _supportedObjectNames = ["material", "materials", "bones", "map"];
var Composite = class {
  constructor(targetGroup, path, optionalParsedPath) {
    const parsedPath = optionalParsedPath || PropertyBinding.parseTrackName(path);
    this._targetGroup = targetGroup;
    this._bindings = targetGroup.subscribe_(path, parsedPath);
  }
  getValue(array, offset) {
    this.bind();
    const firstValidIndex = this._targetGroup.nCachedObjects_, binding = this._bindings[firstValidIndex];
    if (binding !== void 0) binding.getValue(array, offset);
  }
  setValue(array, offset) {
    const bindings = this._bindings;
    for (let i = this._targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i].setValue(array, offset);
    }
  }
  bind() {
    const bindings = this._bindings;
    for (let i = this._targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i].bind();
    }
  }
  unbind() {
    const bindings = this._bindings;
    for (let i = this._targetGroup.nCachedObjects_, n = bindings.length; i !== n; ++i) {
      bindings[i].unbind();
    }
  }
};
var PropertyBinding = class _PropertyBinding {
  /**
   * Constructs a new property binding.
   *
   * @param {Object} rootNode - The root node.
   * @param {string} path - The path.
   * @param {?Object} [parsedPath] - The parsed path.
   */
  constructor(rootNode, path, parsedPath) {
    this.path = path;
    this.parsedPath = parsedPath || _PropertyBinding.parseTrackName(path);
    this.node = _PropertyBinding.findNode(rootNode, this.parsedPath.nodeName);
    this.rootNode = rootNode;
    this.getValue = this._getValue_unbound;
    this.setValue = this._setValue_unbound;
  }
  /**
   * Factory method for creating a property binding from the given parameters.
   *
   * @static
   * @param {Object} root - The root node.
   * @param {string} path - The path.
   * @param {?Object} [parsedPath] - The parsed path.
   * @return {PropertyBinding|Composite} The created property binding or composite.
   */
  static create(root, path, parsedPath) {
    if (!(root && root.isAnimationObjectGroup)) {
      return new _PropertyBinding(root, path, parsedPath);
    } else {
      return new _PropertyBinding.Composite(root, path, parsedPath);
    }
  }
  /**
   * Replaces spaces with underscores and removes unsupported characters from
   * node names, to ensure compatibility with parseTrackName().
   *
   * @param {string} name - Node name to be sanitized.
   * @return {string} The sanitized node name.
   */
  static sanitizeNodeName(name) {
    return name.replace(/\s/g, "_").replace(_reservedRe, "");
  }
  /**
   * Parses the given track name (an object path to an animated property) and
   * returns an object with information about the path. Matches strings in the following forms:
   *
   * - nodeName.property
   * - nodeName.property[accessor]
   * - nodeName.material.property[accessor]
   * - uuid.property[accessor]
   * - uuid.objectName[objectIndex].propertyName[propertyIndex]
   * - parentName/nodeName.property
   * - parentName/parentName/nodeName.property[index]
   * - .bone[Armature.DEF_cog].position
   * - scene:helium_balloon_model:helium_balloon_model.position
   *
   * @static
   * @param {string} trackName - The track name to parse.
   * @return {Object} The parsed track name as an object.
   */
  static parseTrackName(trackName) {
    const matches = _trackRe.exec(trackName);
    if (matches === null) {
      throw new Error("PropertyBinding: Cannot parse trackName: " + trackName);
    }
    const results = {
      // directoryName: matches[ 1 ], // (tschw) currently unused
      nodeName: matches[2],
      objectName: matches[3],
      objectIndex: matches[4],
      propertyName: matches[5],
      // required
      propertyIndex: matches[6]
    };
    const lastDot = results.nodeName && results.nodeName.lastIndexOf(".");
    if (lastDot !== void 0 && lastDot !== -1) {
      const objectName = results.nodeName.substring(lastDot + 1);
      if (_supportedObjectNames.indexOf(objectName) !== -1) {
        results.nodeName = results.nodeName.substring(0, lastDot);
        results.objectName = objectName;
      }
    }
    if (results.propertyName === null || results.propertyName.length === 0) {
      throw new Error("PropertyBinding: can not parse propertyName from trackName: " + trackName);
    }
    return results;
  }
  /**
   * Searches for a node in the hierarchy of the given root object by the given
   * node name.
   *
   * @static
   * @param {Object} root - The root object.
   * @param {string|number} nodeName - The name of the node.
   * @return {?Object} The found node. Returns `null` if no object was found.
   */
  static findNode(root, nodeName) {
    if (nodeName === void 0 || nodeName === "" || nodeName === "." || nodeName === -1 || nodeName === root.name || nodeName === root.uuid) {
      return root;
    }
    if (root.skeleton) {
      const bone = root.skeleton.getBoneByName(nodeName);
      if (bone !== void 0) {
        return bone;
      }
    }
    if (root.children) {
      const searchNodeSubtree = function(children) {
        for (let i = 0; i < children.length; i++) {
          const childNode = children[i];
          if (childNode.name === nodeName || childNode.uuid === nodeName) {
            return childNode;
          }
          const result = searchNodeSubtree(childNode.children);
          if (result) return result;
        }
        return null;
      };
      const subTreeNode = searchNodeSubtree(root.children);
      if (subTreeNode) {
        return subTreeNode;
      }
    }
    return null;
  }
  // these are used to "bind" a nonexistent property
  _getValue_unavailable() {
  }
  _setValue_unavailable() {
  }
  // Getters
  _getValue_direct(buffer, offset) {
    buffer[offset] = this.targetObject[this.propertyName];
  }
  _getValue_array(buffer, offset) {
    const source = this.resolvedProperty;
    for (let i = 0, n = source.length; i !== n; ++i) {
      buffer[offset++] = source[i];
    }
  }
  _getValue_arrayElement(buffer, offset) {
    buffer[offset] = this.resolvedProperty[this.propertyIndex];
  }
  _getValue_toArray(buffer, offset) {
    this.resolvedProperty.toArray(buffer, offset);
  }
  // Direct
  _setValue_direct(buffer, offset) {
    this.targetObject[this.propertyName] = buffer[offset];
  }
  _setValue_direct_setNeedsUpdate(buffer, offset) {
    this.targetObject[this.propertyName] = buffer[offset];
    this.targetObject.needsUpdate = true;
  }
  _setValue_direct_setMatrixWorldNeedsUpdate(buffer, offset) {
    this.targetObject[this.propertyName] = buffer[offset];
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  // EntireArray
  _setValue_array(buffer, offset) {
    const dest = this.resolvedProperty;
    for (let i = 0, n = dest.length; i !== n; ++i) {
      dest[i] = buffer[offset++];
    }
  }
  _setValue_array_setNeedsUpdate(buffer, offset) {
    const dest = this.resolvedProperty;
    for (let i = 0, n = dest.length; i !== n; ++i) {
      dest[i] = buffer[offset++];
    }
    this.targetObject.needsUpdate = true;
  }
  _setValue_array_setMatrixWorldNeedsUpdate(buffer, offset) {
    const dest = this.resolvedProperty;
    for (let i = 0, n = dest.length; i !== n; ++i) {
      dest[i] = buffer[offset++];
    }
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  // ArrayElement
  _setValue_arrayElement(buffer, offset) {
    this.resolvedProperty[this.propertyIndex] = buffer[offset];
  }
  _setValue_arrayElement_setNeedsUpdate(buffer, offset) {
    this.resolvedProperty[this.propertyIndex] = buffer[offset];
    this.targetObject.needsUpdate = true;
  }
  _setValue_arrayElement_setMatrixWorldNeedsUpdate(buffer, offset) {
    this.resolvedProperty[this.propertyIndex] = buffer[offset];
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  // HasToFromArray
  _setValue_fromArray(buffer, offset) {
    this.resolvedProperty.fromArray(buffer, offset);
  }
  _setValue_fromArray_setNeedsUpdate(buffer, offset) {
    this.resolvedProperty.fromArray(buffer, offset);
    this.targetObject.needsUpdate = true;
  }
  _setValue_fromArray_setMatrixWorldNeedsUpdate(buffer, offset) {
    this.resolvedProperty.fromArray(buffer, offset);
    this.targetObject.matrixWorldNeedsUpdate = true;
  }
  _getValue_unbound(targetArray, offset) {
    this.bind();
    this.getValue(targetArray, offset);
  }
  _setValue_unbound(sourceArray, offset) {
    this.bind();
    this.setValue(sourceArray, offset);
  }
  /**
   * Creates a getter / setter pair for the property tracked by this binding.
   */
  bind() {
    let targetObject = this.node;
    const parsedPath = this.parsedPath;
    const objectName = parsedPath.objectName;
    const propertyName = parsedPath.propertyName;
    let propertyIndex = parsedPath.propertyIndex;
    if (!targetObject) {
      targetObject = _PropertyBinding.findNode(this.rootNode, parsedPath.nodeName);
      this.node = targetObject;
    }
    this.getValue = this._getValue_unavailable;
    this.setValue = this._setValue_unavailable;
    if (!targetObject) {
      warn("PropertyBinding: No target node found for track: " + this.path + ".");
      return;
    }
    if (objectName) {
      let objectIndex = parsedPath.objectIndex;
      switch (objectName) {
        case "materials":
          if (!targetObject.material) {
            error("PropertyBinding: Can not bind to material as node does not have a material.", this);
            return;
          }
          if (!targetObject.material.materials) {
            error("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.", this);
            return;
          }
          targetObject = targetObject.material.materials;
          break;
        case "bones":
          if (!targetObject.skeleton) {
            error("PropertyBinding: Can not bind to bones as node does not have a skeleton.", this);
            return;
          }
          targetObject = targetObject.skeleton.bones;
          for (let i = 0; i < targetObject.length; i++) {
            if (targetObject[i].name === objectIndex) {
              objectIndex = i;
              break;
            }
          }
          break;
        case "map":
          if ("map" in targetObject) {
            targetObject = targetObject.map;
            break;
          }
          if (!targetObject.material) {
            error("PropertyBinding: Can not bind to material as node does not have a material.", this);
            return;
          }
          if (!targetObject.material.map) {
            error("PropertyBinding: Can not bind to material.map as node.material does not have a map.", this);
            return;
          }
          targetObject = targetObject.material.map;
          break;
        default:
          if (targetObject[objectName] === void 0) {
            error("PropertyBinding: Can not bind to objectName of node undefined.", this);
            return;
          }
          targetObject = targetObject[objectName];
      }
      if (objectIndex !== void 0) {
        if (targetObject[objectIndex] === void 0) {
          error("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.", this, targetObject);
          return;
        }
        targetObject = targetObject[objectIndex];
      }
    }
    const nodeProperty = targetObject[propertyName];
    if (nodeProperty === void 0) {
      const nodeName = parsedPath.nodeName;
      error("PropertyBinding: Trying to update property for track: " + nodeName + "." + propertyName + " but it wasn't found.", targetObject);
      return;
    }
    let versioning = this.Versioning.None;
    this.targetObject = targetObject;
    if (targetObject.isMaterial === true) {
      versioning = this.Versioning.NeedsUpdate;
    } else if (targetObject.isObject3D === true) {
      versioning = this.Versioning.MatrixWorldNeedsUpdate;
    }
    let bindingType = this.BindingType.Direct;
    if (propertyIndex !== void 0) {
      if (propertyName === "morphTargetInfluences") {
        if (!targetObject.geometry) {
          error("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.", this);
          return;
        }
        if (!targetObject.geometry.morphAttributes) {
          error("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.", this);
          return;
        }
        if (targetObject.morphTargetDictionary[propertyIndex] !== void 0) {
          propertyIndex = targetObject.morphTargetDictionary[propertyIndex];
        }
      }
      bindingType = this.BindingType.ArrayElement;
      this.resolvedProperty = nodeProperty;
      this.propertyIndex = propertyIndex;
    } else if (nodeProperty.fromArray !== void 0 && nodeProperty.toArray !== void 0) {
      bindingType = this.BindingType.HasFromToArray;
      this.resolvedProperty = nodeProperty;
    } else if (Array.isArray(nodeProperty)) {
      bindingType = this.BindingType.EntireArray;
      this.resolvedProperty = nodeProperty;
    } else {
      this.propertyName = propertyName;
    }
    this.getValue = this.GetterByBindingType[bindingType];
    this.setValue = this.SetterByBindingTypeAndVersioning[bindingType][versioning];
  }
  /**
   * Unbinds the property.
   */
  unbind() {
    this.node = null;
    this.getValue = this._getValue_unbound;
    this.setValue = this._setValue_unbound;
  }
};
PropertyBinding.Composite = Composite;
PropertyBinding.prototype.BindingType = {
  Direct: 0,
  EntireArray: 1,
  ArrayElement: 2,
  HasFromToArray: 3
};
PropertyBinding.prototype.Versioning = {
  None: 0,
  NeedsUpdate: 1,
  MatrixWorldNeedsUpdate: 2
};
PropertyBinding.prototype.GetterByBindingType = [
  PropertyBinding.prototype._getValue_direct,
  PropertyBinding.prototype._getValue_array,
  PropertyBinding.prototype._getValue_arrayElement,
  PropertyBinding.prototype._getValue_toArray
];
PropertyBinding.prototype.SetterByBindingTypeAndVersioning = [
  [
    // Direct
    PropertyBinding.prototype._setValue_direct,
    PropertyBinding.prototype._setValue_direct_setNeedsUpdate,
    PropertyBinding.prototype._setValue_direct_setMatrixWorldNeedsUpdate
  ],
  [
    // EntireArray
    PropertyBinding.prototype._setValue_array,
    PropertyBinding.prototype._setValue_array_setNeedsUpdate,
    PropertyBinding.prototype._setValue_array_setMatrixWorldNeedsUpdate
  ],
  [
    // ArrayElement
    PropertyBinding.prototype._setValue_arrayElement,
    PropertyBinding.prototype._setValue_arrayElement_setNeedsUpdate,
    PropertyBinding.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate
  ],
  [
    // HasToFromArray
    PropertyBinding.prototype._setValue_fromArray,
    PropertyBinding.prototype._setValue_fromArray_setNeedsUpdate,
    PropertyBinding.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate
  ]
];
var _controlInterpolantsResultBuffer = new Float32Array(1);
if (typeof __THREE_DEVTOOLS__ !== "undefined") {
  __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register", { detail: {
    revision: REVISION
  } }));
}
if (typeof window !== "undefined") {
  if (window.__THREE__) {
    warn("WARNING: Multiple instances of Three.js being imported.");
  } else {
    window.__THREE__ = REVISION;
  }
}

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/node_modules/three/build/three.module.js
var alphahash_fragment = "#ifdef USE_ALPHAHASH\n	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;\n#endif";
var alphahash_pars_fragment = "#ifdef USE_ALPHAHASH\n	const float ALPHA_HASH_SCALE = 0.05;\n	float hash2D( vec2 value ) {\n		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );\n	}\n	float hash3D( vec3 value ) {\n		return hash2D( vec2( hash2D( value.xy ), value.z ) );\n	}\n	float getAlphaHashThreshold( vec3 position ) {\n		float maxDeriv = max(\n			length( dFdx( position.xyz ) ),\n			length( dFdy( position.xyz ) )\n		);\n		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );\n		vec2 pixScales = vec2(\n			exp2( floor( log2( pixScale ) ) ),\n			exp2( ceil( log2( pixScale ) ) )\n		);\n		vec2 alpha = vec2(\n			hash3D( floor( pixScales.x * position.xyz ) ),\n			hash3D( floor( pixScales.y * position.xyz ) )\n		);\n		float lerpFactor = fract( log2( pixScale ) );\n		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;\n		float a = min( lerpFactor, 1.0 - lerpFactor );\n		vec3 cases = vec3(\n			x * x / ( 2.0 * a * ( 1.0 - a ) ),\n			( x - 0.5 * a ) / ( 1.0 - a ),\n			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )\n		);\n		float threshold = ( x < ( 1.0 - a ) )\n			? ( ( x < a ) ? cases.x : cases.y )\n			: cases.z;\n		return clamp( threshold , 1.0e-6, 1.0 );\n	}\n#endif";
var alphamap_fragment = "#ifdef USE_ALPHAMAP\n	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;\n#endif";
var alphamap_pars_fragment = "#ifdef USE_ALPHAMAP\n	uniform sampler2D alphaMap;\n#endif";
var alphatest_fragment = "#ifdef USE_ALPHATEST\n	#ifdef ALPHA_TO_COVERAGE\n	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );\n	if ( diffuseColor.a == 0.0 ) discard;\n	#else\n	if ( diffuseColor.a < alphaTest ) discard;\n	#endif\n#endif";
var alphatest_pars_fragment = "#ifdef USE_ALPHATEST\n	uniform float alphaTest;\n#endif";
var aomap_fragment = "#ifdef USE_AOMAP\n	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;\n	reflectedLight.indirectDiffuse *= ambientOcclusion;\n	#if defined( USE_CLEARCOAT ) \n		clearcoatSpecularIndirect *= ambientOcclusion;\n	#endif\n	#if defined( USE_SHEEN ) \n		sheenSpecularIndirect *= ambientOcclusion;\n	#endif\n	#if defined( USE_ENVMAP ) && defined( STANDARD )\n		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );\n		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );\n	#endif\n#endif";
var aomap_pars_fragment = "#ifdef USE_AOMAP\n	uniform sampler2D aoMap;\n	uniform float aoMapIntensity;\n#endif";
var batching_pars_vertex = "#ifdef USE_BATCHING\n	#if ! defined( GL_ANGLE_multi_draw )\n	#define gl_DrawID _gl_DrawID\n	uniform int _gl_DrawID;\n	#endif\n	uniform highp sampler2D batchingTexture;\n	uniform highp usampler2D batchingIdTexture;\n	mat4 getBatchingMatrix( const in float i ) {\n		int size = textureSize( batchingTexture, 0 ).x;\n		int j = int( i ) * 4;\n		int x = j % size;\n		int y = j / size;\n		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );\n		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );\n		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );\n		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );\n		return mat4( v1, v2, v3, v4 );\n	}\n	float getIndirectIndex( const in int i ) {\n		int size = textureSize( batchingIdTexture, 0 ).x;\n		int x = i % size;\n		int y = i / size;\n		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );\n	}\n#endif\n#ifdef USE_BATCHING_COLOR\n	uniform sampler2D batchingColorTexture;\n	vec3 getBatchingColor( const in float i ) {\n		int size = textureSize( batchingColorTexture, 0 ).x;\n		int j = int( i );\n		int x = j % size;\n		int y = j / size;\n		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;\n	}\n#endif";
var batching_vertex = "#ifdef USE_BATCHING\n	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );\n#endif";
var begin_vertex = "vec3 transformed = vec3( position );\n#ifdef USE_ALPHAHASH\n	vPosition = vec3( position );\n#endif";
var beginnormal_vertex = "vec3 objectNormal = vec3( normal );\n#ifdef USE_TANGENT\n	vec3 objectTangent = vec3( tangent.xyz );\n#endif";
var bsdfs = "float G_BlinnPhong_Implicit( ) {\n	return 0.25;\n}\nfloat D_BlinnPhong( const in float shininess, const in float dotNH ) {\n	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );\n}\nvec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {\n	vec3 halfDir = normalize( lightDir + viewDir );\n	float dotNH = saturate( dot( normal, halfDir ) );\n	float dotVH = saturate( dot( viewDir, halfDir ) );\n	vec3 F = F_Schlick( specularColor, 1.0, dotVH );\n	float G = G_BlinnPhong_Implicit( );\n	float D = D_BlinnPhong( shininess, dotNH );\n	return F * ( G * D );\n} // validated";
var iridescence_fragment = "#ifdef USE_IRIDESCENCE\n	const mat3 XYZ_TO_REC709 = mat3(\n		 3.2404542, -0.9692660,  0.0556434,\n		-1.5371385,  1.8760108, -0.2040259,\n		-0.4985314,  0.0415560,  1.0572252\n	);\n	vec3 Fresnel0ToIor( vec3 fresnel0 ) {\n		vec3 sqrtF0 = sqrt( fresnel0 );\n		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );\n	}\n	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {\n		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );\n	}\n	float IorToFresnel0( float transmittedIor, float incidentIor ) {\n		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));\n	}\n	vec3 evalSensitivity( float OPD, vec3 shift ) {\n		float phase = 2.0 * PI * OPD * 1.0e-9;\n		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );\n		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );\n		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );\n		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );\n		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );\n		xyz /= 1.0685e-7;\n		vec3 rgb = XYZ_TO_REC709 * xyz;\n		return rgb;\n	}\n	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {\n		vec3 I;\n		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );\n		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );\n		float cosTheta2Sq = 1.0 - sinTheta2Sq;\n		if ( cosTheta2Sq < 0.0 ) {\n			return vec3( 1.0 );\n		}\n		float cosTheta2 = sqrt( cosTheta2Sq );\n		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );\n		float R12 = F_Schlick( R0, 1.0, cosTheta1 );\n		float T121 = 1.0 - R12;\n		float phi12 = 0.0;\n		if ( iridescenceIOR < outsideIOR ) phi12 = PI;\n		float phi21 = PI - phi12;\n		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );\n		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );\n		vec3 phi23 = vec3( 0.0 );\n		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;\n		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;\n		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;\n		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;\n		vec3 phi = vec3( phi21 ) + phi23;\n		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );\n		vec3 r123 = sqrt( R123 );\n		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );\n		vec3 C0 = R12 + Rs;\n		I = C0;\n		vec3 Cm = Rs - T121;\n		for ( int m = 1; m <= 2; ++ m ) {\n			Cm *= r123;\n			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );\n			I += Cm * Sm;\n		}\n		return max( I, vec3( 0.0 ) );\n	}\n#endif";
var bumpmap_pars_fragment = "#ifdef USE_BUMPMAP\n	uniform sampler2D bumpMap;\n	uniform float bumpScale;\n	vec2 dHdxy_fwd() {\n		vec2 dSTdx = dFdx( vBumpMapUv );\n		vec2 dSTdy = dFdy( vBumpMapUv );\n		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;\n		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;\n		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;\n		return vec2( dBx, dBy );\n	}\n	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {\n		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );\n		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );\n		vec3 vN = surf_norm;\n		vec3 R1 = cross( vSigmaY, vN );\n		vec3 R2 = cross( vN, vSigmaX );\n		float fDet = dot( vSigmaX, R1 ) * faceDirection;\n		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );\n		return normalize( abs( fDet ) * surf_norm - vGrad );\n	}\n#endif";
var clipping_planes_fragment = "#if NUM_CLIPPING_PLANES > 0\n	vec4 plane;\n	#ifdef ALPHA_TO_COVERAGE\n		float distanceToPlane, distanceGradient;\n		float clipOpacity = 1.0;\n		#pragma unroll_loop_start\n		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {\n			plane = clippingPlanes[ i ];\n			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;\n			distanceGradient = fwidth( distanceToPlane ) / 2.0;\n			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );\n			if ( clipOpacity == 0.0 ) discard;\n		}\n		#pragma unroll_loop_end\n		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES\n			float unionClipOpacity = 1.0;\n			#pragma unroll_loop_start\n			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {\n				plane = clippingPlanes[ i ];\n				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;\n				distanceGradient = fwidth( distanceToPlane ) / 2.0;\n				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );\n			}\n			#pragma unroll_loop_end\n			clipOpacity *= 1.0 - unionClipOpacity;\n		#endif\n		diffuseColor.a *= clipOpacity;\n		if ( diffuseColor.a == 0.0 ) discard;\n	#else\n		#pragma unroll_loop_start\n		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {\n			plane = clippingPlanes[ i ];\n			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;\n		}\n		#pragma unroll_loop_end\n		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES\n			bool clipped = true;\n			#pragma unroll_loop_start\n			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {\n				plane = clippingPlanes[ i ];\n				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;\n			}\n			#pragma unroll_loop_end\n			if ( clipped ) discard;\n		#endif\n	#endif\n#endif";
var clipping_planes_pars_fragment = "#if NUM_CLIPPING_PLANES > 0\n	varying vec3 vClipPosition;\n	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];\n#endif";
var clipping_planes_pars_vertex = "#if NUM_CLIPPING_PLANES > 0\n	varying vec3 vClipPosition;\n#endif";
var clipping_planes_vertex = "#if NUM_CLIPPING_PLANES > 0\n	vClipPosition = - mvPosition.xyz;\n#endif";
var color_fragment = "#if defined( USE_COLOR_ALPHA )\n	diffuseColor *= vColor;\n#elif defined( USE_COLOR )\n	diffuseColor.rgb *= vColor;\n#endif";
var color_pars_fragment = "#if defined( USE_COLOR_ALPHA )\n	varying vec4 vColor;\n#elif defined( USE_COLOR )\n	varying vec3 vColor;\n#endif";
var color_pars_vertex = "#if defined( USE_COLOR_ALPHA )\n	varying vec4 vColor;\n#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )\n	varying vec3 vColor;\n#endif";
var color_vertex = "#if defined( USE_COLOR_ALPHA )\n	vColor = vec4( 1.0 );\n#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )\n	vColor = vec3( 1.0 );\n#endif\n#ifdef USE_COLOR\n	vColor *= color;\n#endif\n#ifdef USE_INSTANCING_COLOR\n	vColor.xyz *= instanceColor.xyz;\n#endif\n#ifdef USE_BATCHING_COLOR\n	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );\n	vColor.xyz *= batchingColor.xyz;\n#endif";
var common = "#define PI 3.141592653589793\n#define PI2 6.283185307179586\n#define PI_HALF 1.5707963267948966\n#define RECIPROCAL_PI 0.3183098861837907\n#define RECIPROCAL_PI2 0.15915494309189535\n#define EPSILON 1e-6\n#ifndef saturate\n#define saturate( a ) clamp( a, 0.0, 1.0 )\n#endif\n#define whiteComplement( a ) ( 1.0 - saturate( a ) )\nfloat pow2( const in float x ) { return x*x; }\nvec3 pow2( const in vec3 x ) { return x*x; }\nfloat pow3( const in float x ) { return x*x*x; }\nfloat pow4( const in float x ) { float x2 = x*x; return x2*x2; }\nfloat max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }\nfloat average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }\nhighp float rand( const in vec2 uv ) {\n	const highp float a = 12.9898, b = 78.233, c = 43758.5453;\n	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );\n	return fract( sin( sn ) * c );\n}\n#ifdef HIGH_PRECISION\n	float precisionSafeLength( vec3 v ) { return length( v ); }\n#else\n	float precisionSafeLength( vec3 v ) {\n		float maxComponent = max3( abs( v ) );\n		return length( v / maxComponent ) * maxComponent;\n	}\n#endif\nstruct IncidentLight {\n	vec3 color;\n	vec3 direction;\n	bool visible;\n};\nstruct ReflectedLight {\n	vec3 directDiffuse;\n	vec3 directSpecular;\n	vec3 indirectDiffuse;\n	vec3 indirectSpecular;\n};\n#ifdef USE_ALPHAHASH\n	varying vec3 vPosition;\n#endif\nvec3 transformDirection( in vec3 dir, in mat4 matrix ) {\n	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );\n}\nvec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {\n	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );\n}\nbool isPerspectiveMatrix( mat4 m ) {\n	return m[ 2 ][ 3 ] == - 1.0;\n}\nvec2 equirectUv( in vec3 dir ) {\n	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;\n	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;\n	return vec2( u, v );\n}\nvec3 BRDF_Lambert( const in vec3 diffuseColor ) {\n	return RECIPROCAL_PI * diffuseColor;\n}\nvec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {\n	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n}\nfloat F_Schlick( const in float f0, const in float f90, const in float dotVH ) {\n	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );\n	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );\n} // validated";
var cube_uv_reflection_fragment = "#ifdef ENVMAP_TYPE_CUBE_UV\n	#define cubeUV_minMipLevel 4.0\n	#define cubeUV_minTileSize 16.0\n	float getFace( vec3 direction ) {\n		vec3 absDirection = abs( direction );\n		float face = - 1.0;\n		if ( absDirection.x > absDirection.z ) {\n			if ( absDirection.x > absDirection.y )\n				face = direction.x > 0.0 ? 0.0 : 3.0;\n			else\n				face = direction.y > 0.0 ? 1.0 : 4.0;\n		} else {\n			if ( absDirection.z > absDirection.y )\n				face = direction.z > 0.0 ? 2.0 : 5.0;\n			else\n				face = direction.y > 0.0 ? 1.0 : 4.0;\n		}\n		return face;\n	}\n	vec2 getUV( vec3 direction, float face ) {\n		vec2 uv;\n		if ( face == 0.0 ) {\n			uv = vec2( direction.z, direction.y ) / abs( direction.x );\n		} else if ( face == 1.0 ) {\n			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );\n		} else if ( face == 2.0 ) {\n			uv = vec2( - direction.x, direction.y ) / abs( direction.z );\n		} else if ( face == 3.0 ) {\n			uv = vec2( - direction.z, direction.y ) / abs( direction.x );\n		} else if ( face == 4.0 ) {\n			uv = vec2( - direction.x, direction.z ) / abs( direction.y );\n		} else {\n			uv = vec2( direction.x, direction.y ) / abs( direction.z );\n		}\n		return 0.5 * ( uv + 1.0 );\n	}\n	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {\n		float face = getFace( direction );\n		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );\n		mipInt = max( mipInt, cubeUV_minMipLevel );\n		float faceSize = exp2( mipInt );\n		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;\n		if ( face > 2.0 ) {\n			uv.y += faceSize;\n			face -= 3.0;\n		}\n		uv.x += face * faceSize;\n		uv.x += filterInt * 3.0 * cubeUV_minTileSize;\n		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );\n		uv.x *= CUBEUV_TEXEL_WIDTH;\n		uv.y *= CUBEUV_TEXEL_HEIGHT;\n		#ifdef texture2DGradEXT\n			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;\n		#else\n			return texture2D( envMap, uv ).rgb;\n		#endif\n	}\n	#define cubeUV_r0 1.0\n	#define cubeUV_m0 - 2.0\n	#define cubeUV_r1 0.8\n	#define cubeUV_m1 - 1.0\n	#define cubeUV_r4 0.4\n	#define cubeUV_m4 2.0\n	#define cubeUV_r5 0.305\n	#define cubeUV_m5 3.0\n	#define cubeUV_r6 0.21\n	#define cubeUV_m6 4.0\n	float roughnessToMip( float roughness ) {\n		float mip = 0.0;\n		if ( roughness >= cubeUV_r1 ) {\n			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;\n		} else if ( roughness >= cubeUV_r4 ) {\n			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;\n		} else if ( roughness >= cubeUV_r5 ) {\n			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;\n		} else if ( roughness >= cubeUV_r6 ) {\n			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;\n		} else {\n			mip = - 2.0 * log2( 1.16 * roughness );		}\n		return mip;\n	}\n	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {\n		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );\n		float mipF = fract( mip );\n		float mipInt = floor( mip );\n		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );\n		if ( mipF == 0.0 ) {\n			return vec4( color0, 1.0 );\n		} else {\n			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );\n			return vec4( mix( color0, color1, mipF ), 1.0 );\n		}\n	}\n#endif";
var defaultnormal_vertex = "vec3 transformedNormal = objectNormal;\n#ifdef USE_TANGENT\n	vec3 transformedTangent = objectTangent;\n#endif\n#ifdef USE_BATCHING\n	mat3 bm = mat3( batchingMatrix );\n	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );\n	transformedNormal = bm * transformedNormal;\n	#ifdef USE_TANGENT\n		transformedTangent = bm * transformedTangent;\n	#endif\n#endif\n#ifdef USE_INSTANCING\n	mat3 im = mat3( instanceMatrix );\n	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );\n	transformedNormal = im * transformedNormal;\n	#ifdef USE_TANGENT\n		transformedTangent = im * transformedTangent;\n	#endif\n#endif\ntransformedNormal = normalMatrix * transformedNormal;\n#ifdef FLIP_SIDED\n	transformedNormal = - transformedNormal;\n#endif\n#ifdef USE_TANGENT\n	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;\n	#ifdef FLIP_SIDED\n		transformedTangent = - transformedTangent;\n	#endif\n#endif";
var displacementmap_pars_vertex = "#ifdef USE_DISPLACEMENTMAP\n	uniform sampler2D displacementMap;\n	uniform float displacementScale;\n	uniform float displacementBias;\n#endif";
var displacementmap_vertex = "#ifdef USE_DISPLACEMENTMAP\n	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );\n#endif";
var emissivemap_fragment = "#ifdef USE_EMISSIVEMAP\n	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );\n	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE\n		emissiveColor = sRGBTransferEOTF( emissiveColor );\n	#endif\n	totalEmissiveRadiance *= emissiveColor.rgb;\n#endif";
var emissivemap_pars_fragment = "#ifdef USE_EMISSIVEMAP\n	uniform sampler2D emissiveMap;\n#endif";
var colorspace_fragment = "gl_FragColor = linearToOutputTexel( gl_FragColor );";
var colorspace_pars_fragment = "vec4 LinearTransferOETF( in vec4 value ) {\n	return value;\n}\nvec4 sRGBTransferEOTF( in vec4 value ) {\n	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );\n}\nvec4 sRGBTransferOETF( in vec4 value ) {\n	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );\n}";
var envmap_fragment = "#ifdef USE_ENVMAP\n	#ifdef ENV_WORLDPOS\n		vec3 cameraToFrag;\n		if ( isOrthographic ) {\n			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );\n		} else {\n			cameraToFrag = normalize( vWorldPosition - cameraPosition );\n		}\n		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\n		#ifdef ENVMAP_MODE_REFLECTION\n			vec3 reflectVec = reflect( cameraToFrag, worldNormal );\n		#else\n			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );\n		#endif\n	#else\n		vec3 reflectVec = vReflect;\n	#endif\n	#ifdef ENVMAP_TYPE_CUBE\n		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );\n	#else\n		vec4 envColor = vec4( 0.0 );\n	#endif\n	#ifdef ENVMAP_BLENDING_MULTIPLY\n		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );\n	#elif defined( ENVMAP_BLENDING_MIX )\n		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );\n	#elif defined( ENVMAP_BLENDING_ADD )\n		outgoingLight += envColor.xyz * specularStrength * reflectivity;\n	#endif\n#endif";
var envmap_common_pars_fragment = "#ifdef USE_ENVMAP\n	uniform float envMapIntensity;\n	uniform float flipEnvMap;\n	uniform mat3 envMapRotation;\n	#ifdef ENVMAP_TYPE_CUBE\n		uniform samplerCube envMap;\n	#else\n		uniform sampler2D envMap;\n	#endif\n#endif";
var envmap_pars_fragment = "#ifdef USE_ENVMAP\n	uniform float reflectivity;\n	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )\n		#define ENV_WORLDPOS\n	#endif\n	#ifdef ENV_WORLDPOS\n		varying vec3 vWorldPosition;\n		uniform float refractionRatio;\n	#else\n		varying vec3 vReflect;\n	#endif\n#endif";
var envmap_pars_vertex = "#ifdef USE_ENVMAP\n	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )\n		#define ENV_WORLDPOS\n	#endif\n	#ifdef ENV_WORLDPOS\n		\n		varying vec3 vWorldPosition;\n	#else\n		varying vec3 vReflect;\n		uniform float refractionRatio;\n	#endif\n#endif";
var envmap_vertex = "#ifdef USE_ENVMAP\n	#ifdef ENV_WORLDPOS\n		vWorldPosition = worldPosition.xyz;\n	#else\n		vec3 cameraToVertex;\n		if ( isOrthographic ) {\n			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );\n		} else {\n			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );\n		}\n		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n		#ifdef ENVMAP_MODE_REFLECTION\n			vReflect = reflect( cameraToVertex, worldNormal );\n		#else\n			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );\n		#endif\n	#endif\n#endif";
var fog_vertex = "#ifdef USE_FOG\n	vFogDepth = - mvPosition.z;\n#endif";
var fog_pars_vertex = "#ifdef USE_FOG\n	varying float vFogDepth;\n#endif";
var fog_fragment = "#ifdef USE_FOG\n	#ifdef FOG_EXP2\n		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n	#else\n		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );\n	#endif\n	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif";
var fog_pars_fragment = "#ifdef USE_FOG\n	uniform vec3 fogColor;\n	varying float vFogDepth;\n	#ifdef FOG_EXP2\n		uniform float fogDensity;\n	#else\n		uniform float fogNear;\n		uniform float fogFar;\n	#endif\n#endif";
var gradientmap_pars_fragment = "#ifdef USE_GRADIENTMAP\n	uniform sampler2D gradientMap;\n#endif\nvec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {\n	float dotNL = dot( normal, lightDirection );\n	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );\n	#ifdef USE_GRADIENTMAP\n		return vec3( texture2D( gradientMap, coord ).r );\n	#else\n		vec2 fw = fwidth( coord ) * 0.5;\n		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );\n	#endif\n}";
var lightmap_pars_fragment = "#ifdef USE_LIGHTMAP\n	uniform sampler2D lightMap;\n	uniform float lightMapIntensity;\n#endif";
var lights_lambert_fragment = "LambertMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;\nmaterial.specularStrength = specularStrength;";
var lights_lambert_pars_fragment = "varying vec3 vViewPosition;\nstruct LambertMaterial {\n	vec3 diffuseColor;\n	float specularStrength;\n};\nvoid RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {\n	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n	vec3 irradiance = dotNL * directLight.color;\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\n#define RE_Direct				RE_Direct_Lambert\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert";
var lights_pars_begin = "uniform bool receiveShadow;\nuniform vec3 ambientLightColor;\n#if defined( USE_LIGHT_PROBES )\n	uniform vec3 lightProbe[ 9 ];\n#endif\nvec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {\n	float x = normal.x, y = normal.y, z = normal.z;\n	vec3 result = shCoefficients[ 0 ] * 0.886227;\n	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;\n	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;\n	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;\n	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;\n	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;\n	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );\n	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;\n	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );\n	return result;\n}\nvec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {\n	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\n	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );\n	return irradiance;\n}\nvec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {\n	vec3 irradiance = ambientLightColor;\n	return irradiance;\n}\nfloat getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {\n	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );\n	if ( cutoffDistance > 0.0 ) {\n		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );\n	}\n	return distanceFalloff;\n}\nfloat getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {\n	return smoothstep( coneCosine, penumbraCosine, angleCosine );\n}\n#if NUM_DIR_LIGHTS > 0\n	struct DirectionalLight {\n		vec3 direction;\n		vec3 color;\n	};\n	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];\n	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {\n		light.color = directionalLight.color;\n		light.direction = directionalLight.direction;\n		light.visible = true;\n	}\n#endif\n#if NUM_POINT_LIGHTS > 0\n	struct PointLight {\n		vec3 position;\n		vec3 color;\n		float distance;\n		float decay;\n	};\n	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];\n	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {\n		vec3 lVector = pointLight.position - geometryPosition;\n		light.direction = normalize( lVector );\n		float lightDistance = length( lVector );\n		light.color = pointLight.color;\n		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );\n		light.visible = ( light.color != vec3( 0.0 ) );\n	}\n#endif\n#if NUM_SPOT_LIGHTS > 0\n	struct SpotLight {\n		vec3 position;\n		vec3 direction;\n		vec3 color;\n		float distance;\n		float decay;\n		float coneCos;\n		float penumbraCos;\n	};\n	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];\n	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {\n		vec3 lVector = spotLight.position - geometryPosition;\n		light.direction = normalize( lVector );\n		float angleCos = dot( light.direction, spotLight.direction );\n		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );\n		if ( spotAttenuation > 0.0 ) {\n			float lightDistance = length( lVector );\n			light.color = spotLight.color * spotAttenuation;\n			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );\n			light.visible = ( light.color != vec3( 0.0 ) );\n		} else {\n			light.color = vec3( 0.0 );\n			light.visible = false;\n		}\n	}\n#endif\n#if NUM_RECT_AREA_LIGHTS > 0\n	struct RectAreaLight {\n		vec3 color;\n		vec3 position;\n		vec3 halfWidth;\n		vec3 halfHeight;\n	};\n	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;\n	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];\n#endif\n#if NUM_HEMI_LIGHTS > 0\n	struct HemisphereLight {\n		vec3 direction;\n		vec3 skyColor;\n		vec3 groundColor;\n	};\n	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];\n	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {\n		float dotNL = dot( normal, hemiLight.direction );\n		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;\n		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );\n		return irradiance;\n	}\n#endif";
var envmap_physical_pars_fragment = "#ifdef USE_ENVMAP\n	vec3 getIBLIrradiance( const in vec3 normal ) {\n		#ifdef ENVMAP_TYPE_CUBE_UV\n			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\n			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );\n			return PI * envMapColor.rgb * envMapIntensity;\n		#else\n			return vec3( 0.0 );\n		#endif\n	}\n	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {\n		#ifdef ENVMAP_TYPE_CUBE_UV\n			vec3 reflectVec = reflect( - viewDir, normal );\n			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );\n			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );\n			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );\n			return envMapColor.rgb * envMapIntensity;\n		#else\n			return vec3( 0.0 );\n		#endif\n	}\n	#ifdef USE_ANISOTROPY\n		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {\n			#ifdef ENVMAP_TYPE_CUBE_UV\n				vec3 bentNormal = cross( bitangent, viewDir );\n				bentNormal = normalize( cross( bentNormal, bitangent ) );\n				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );\n				return getIBLRadiance( viewDir, bentNormal, roughness );\n			#else\n				return vec3( 0.0 );\n			#endif\n		}\n	#endif\n#endif";
var lights_toon_fragment = "ToonMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;";
var lights_toon_pars_fragment = "varying vec3 vViewPosition;\nstruct ToonMaterial {\n	vec3 diffuseColor;\n};\nvoid RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {\n	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\nvoid RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\n#define RE_Direct				RE_Direct_Toon\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon";
var lights_phong_fragment = "BlinnPhongMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;\nmaterial.specularColor = specular;\nmaterial.specularShininess = shininess;\nmaterial.specularStrength = specularStrength;";
var lights_phong_pars_fragment = "varying vec3 vViewPosition;\nstruct BlinnPhongMaterial {\n	vec3 diffuseColor;\n	vec3 specularColor;\n	float specularShininess;\n	float specularStrength;\n};\nvoid RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {\n	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n	vec3 irradiance = dotNL * directLight.color;\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;\n}\nvoid RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {\n	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}\n#define RE_Direct				RE_Direct_BlinnPhong\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong";
var lights_physical_fragment = "PhysicalMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;\nmaterial.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );\nmaterial.metalness = metalnessFactor;\nvec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );\nfloat geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );\nmaterial.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;\nmaterial.roughness = min( material.roughness, 1.0 );\n#ifdef IOR\n	material.ior = ior;\n	#ifdef USE_SPECULAR\n		float specularIntensityFactor = specularIntensity;\n		vec3 specularColorFactor = specularColor;\n		#ifdef USE_SPECULAR_COLORMAP\n			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;\n		#endif\n		#ifdef USE_SPECULAR_INTENSITYMAP\n			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;\n		#endif\n		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );\n	#else\n		float specularIntensityFactor = 1.0;\n		vec3 specularColorFactor = vec3( 1.0 );\n		material.specularF90 = 1.0;\n	#endif\n	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;\n	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );\n#else\n	material.specularColor = vec3( 0.04 );\n	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );\n	material.specularF90 = 1.0;\n#endif\n#ifdef USE_CLEARCOAT\n	material.clearcoat = clearcoat;\n	material.clearcoatRoughness = clearcoatRoughness;\n	material.clearcoatF0 = vec3( 0.04 );\n	material.clearcoatF90 = 1.0;\n	#ifdef USE_CLEARCOATMAP\n		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;\n	#endif\n	#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;\n	#endif\n	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );\n	material.clearcoatRoughness += geometryRoughness;\n	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );\n#endif\n#ifdef USE_DISPERSION\n	material.dispersion = dispersion;\n#endif\n#ifdef USE_IRIDESCENCE\n	material.iridescence = iridescence;\n	material.iridescenceIOR = iridescenceIOR;\n	#ifdef USE_IRIDESCENCEMAP\n		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;\n	#endif\n	#ifdef USE_IRIDESCENCE_THICKNESSMAP\n		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;\n	#else\n		material.iridescenceThickness = iridescenceThicknessMaximum;\n	#endif\n#endif\n#ifdef USE_SHEEN\n	material.sheenColor = sheenColor;\n	#ifdef USE_SHEEN_COLORMAP\n		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;\n	#endif\n	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );\n	#ifdef USE_SHEEN_ROUGHNESSMAP\n		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;\n	#endif\n#endif\n#ifdef USE_ANISOTROPY\n	#ifdef USE_ANISOTROPYMAP\n		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );\n		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;\n		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;\n	#else\n		vec2 anisotropyV = anisotropyVector;\n	#endif\n	material.anisotropy = length( anisotropyV );\n	if( material.anisotropy == 0.0 ) {\n		anisotropyV = vec2( 1.0, 0.0 );\n	} else {\n		anisotropyV /= material.anisotropy;\n		material.anisotropy = saturate( material.anisotropy );\n	}\n	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );\n	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;\n	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;\n#endif";
var lights_physical_pars_fragment = "uniform sampler2D dfgLUT;\nstruct PhysicalMaterial {\n	vec3 diffuseColor;\n	vec3 diffuseContribution;\n	vec3 specularColor;\n	vec3 specularColorBlended;\n	float roughness;\n	float metalness;\n	float specularF90;\n	float dispersion;\n	#ifdef USE_CLEARCOAT\n		float clearcoat;\n		float clearcoatRoughness;\n		vec3 clearcoatF0;\n		float clearcoatF90;\n	#endif\n	#ifdef USE_IRIDESCENCE\n		float iridescence;\n		float iridescenceIOR;\n		float iridescenceThickness;\n		vec3 iridescenceFresnel;\n		vec3 iridescenceF0;\n		vec3 iridescenceFresnelDielectric;\n		vec3 iridescenceFresnelMetallic;\n	#endif\n	#ifdef USE_SHEEN\n		vec3 sheenColor;\n		float sheenRoughness;\n	#endif\n	#ifdef IOR\n		float ior;\n	#endif\n	#ifdef USE_TRANSMISSION\n		float transmission;\n		float transmissionAlpha;\n		float thickness;\n		float attenuationDistance;\n		vec3 attenuationColor;\n	#endif\n	#ifdef USE_ANISOTROPY\n		float anisotropy;\n		float alphaT;\n		vec3 anisotropyT;\n		vec3 anisotropyB;\n	#endif\n};\nvec3 clearcoatSpecularDirect = vec3( 0.0 );\nvec3 clearcoatSpecularIndirect = vec3( 0.0 );\nvec3 sheenSpecularDirect = vec3( 0.0 );\nvec3 sheenSpecularIndirect = vec3(0.0 );\nvec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {\n    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );\n    float x2 = x * x;\n    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );\n    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );\n}\nfloat V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {\n	float a2 = pow2( alpha );\n	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );\n	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );\n	return 0.5 / max( gv + gl, EPSILON );\n}\nfloat D_GGX( const in float alpha, const in float dotNH ) {\n	float a2 = pow2( alpha );\n	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;\n	return RECIPROCAL_PI * a2 / pow2( denom );\n}\n#ifdef USE_ANISOTROPY\n	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {\n		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );\n		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );\n		float v = 0.5 / ( gv + gl );\n		return v;\n	}\n	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {\n		float a2 = alphaT * alphaB;\n		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );\n		highp float v2 = dot( v, v );\n		float w2 = a2 / v2;\n		return RECIPROCAL_PI * a2 * pow2 ( w2 );\n	}\n#endif\n#ifdef USE_CLEARCOAT\n	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {\n		vec3 f0 = material.clearcoatF0;\n		float f90 = material.clearcoatF90;\n		float roughness = material.clearcoatRoughness;\n		float alpha = pow2( roughness );\n		vec3 halfDir = normalize( lightDir + viewDir );\n		float dotNL = saturate( dot( normal, lightDir ) );\n		float dotNV = saturate( dot( normal, viewDir ) );\n		float dotNH = saturate( dot( normal, halfDir ) );\n		float dotVH = saturate( dot( viewDir, halfDir ) );\n		vec3 F = F_Schlick( f0, f90, dotVH );\n		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );\n		float D = D_GGX( alpha, dotNH );\n		return F * ( V * D );\n	}\n#endif\nvec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {\n	vec3 f0 = material.specularColorBlended;\n	float f90 = material.specularF90;\n	float roughness = material.roughness;\n	float alpha = pow2( roughness );\n	vec3 halfDir = normalize( lightDir + viewDir );\n	float dotNL = saturate( dot( normal, lightDir ) );\n	float dotNV = saturate( dot( normal, viewDir ) );\n	float dotNH = saturate( dot( normal, halfDir ) );\n	float dotVH = saturate( dot( viewDir, halfDir ) );\n	vec3 F = F_Schlick( f0, f90, dotVH );\n	#ifdef USE_IRIDESCENCE\n		F = mix( F, material.iridescenceFresnel, material.iridescence );\n	#endif\n	#ifdef USE_ANISOTROPY\n		float dotTL = dot( material.anisotropyT, lightDir );\n		float dotTV = dot( material.anisotropyT, viewDir );\n		float dotTH = dot( material.anisotropyT, halfDir );\n		float dotBL = dot( material.anisotropyB, lightDir );\n		float dotBV = dot( material.anisotropyB, viewDir );\n		float dotBH = dot( material.anisotropyB, halfDir );\n		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );\n		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );\n	#else\n		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );\n		float D = D_GGX( alpha, dotNH );\n	#endif\n	return F * ( V * D );\n}\nvec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {\n	const float LUT_SIZE = 64.0;\n	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;\n	const float LUT_BIAS = 0.5 / LUT_SIZE;\n	float dotNV = saturate( dot( N, V ) );\n	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );\n	uv = uv * LUT_SCALE + LUT_BIAS;\n	return uv;\n}\nfloat LTC_ClippedSphereFormFactor( const in vec3 f ) {\n	float l = length( f );\n	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );\n}\nvec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {\n	float x = dot( v1, v2 );\n	float y = abs( x );\n	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;\n	float b = 3.4175940 + ( 4.1616724 + y ) * y;\n	float v = a / b;\n	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;\n	return cross( v1, v2 ) * theta_sintheta;\n}\nvec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {\n	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];\n	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];\n	vec3 lightNormal = cross( v1, v2 );\n	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );\n	vec3 T1, T2;\n	T1 = normalize( V - N * dot( V, N ) );\n	T2 = - cross( N, T1 );\n	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );\n	vec3 coords[ 4 ];\n	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );\n	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );\n	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );\n	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );\n	coords[ 0 ] = normalize( coords[ 0 ] );\n	coords[ 1 ] = normalize( coords[ 1 ] );\n	coords[ 2 ] = normalize( coords[ 2 ] );\n	coords[ 3 ] = normalize( coords[ 3 ] );\n	vec3 vectorFormFactor = vec3( 0.0 );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );\n	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );\n	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );\n	return vec3( result );\n}\n#if defined( USE_SHEEN )\nfloat D_Charlie( float roughness, float dotNH ) {\n	float alpha = pow2( roughness );\n	float invAlpha = 1.0 / alpha;\n	float cos2h = dotNH * dotNH;\n	float sin2h = max( 1.0 - cos2h, 0.0078125 );\n	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );\n}\nfloat V_Neubelt( float dotNV, float dotNL ) {\n	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );\n}\nvec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {\n	vec3 halfDir = normalize( lightDir + viewDir );\n	float dotNL = saturate( dot( normal, lightDir ) );\n	float dotNV = saturate( dot( normal, viewDir ) );\n	float dotNH = saturate( dot( normal, halfDir ) );\n	float D = D_Charlie( sheenRoughness, dotNH );\n	float V = V_Neubelt( dotNV, dotNL );\n	return sheenColor * ( D * V );\n}\n#endif\nfloat IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {\n	float dotNV = saturate( dot( normal, viewDir ) );\n	float r2 = roughness * roughness;\n	float rInv = 1.0 / ( roughness + 0.1 );\n	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;\n	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;\n	float DG = exp( a * dotNV + b );\n	return saturate( DG );\n}\nvec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {\n	float dotNV = saturate( dot( normal, viewDir ) );\n	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;\n	return specularColor * fab.x + specularF90 * fab.y;\n}\n#ifdef USE_IRIDESCENCE\nvoid computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {\n#else\nvoid computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {\n#endif\n	float dotNV = saturate( dot( normal, viewDir ) );\n	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;\n	#ifdef USE_IRIDESCENCE\n		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );\n	#else\n		vec3 Fr = specularColor;\n	#endif\n	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;\n	float Ess = fab.x + fab.y;\n	float Ems = 1.0 - Ess;\n	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );\n	singleScatter += FssEss;\n	multiScatter += Fms * Ems;\n}\nvec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {\n	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );\n	float dotNL = saturate( dot( normal, lightDir ) );\n	float dotNV = saturate( dot( normal, viewDir ) );\n	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;\n	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;\n	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;\n	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;\n	float Ess_V = dfgV.x + dfgV.y;\n	float Ess_L = dfgL.x + dfgL.y;\n	float Ems_V = 1.0 - Ess_V;\n	float Ems_L = 1.0 - Ess_L;\n	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;\n	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );\n	float compensationFactor = Ems_V * Ems_L;\n	vec3 multiScatter = Fms * compensationFactor;\n	return singleScatter + multiScatter;\n}\n#if NUM_RECT_AREA_LIGHTS > 0\n	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {\n		vec3 normal = geometryNormal;\n		vec3 viewDir = geometryViewDir;\n		vec3 position = geometryPosition;\n		vec3 lightPos = rectAreaLight.position;\n		vec3 halfWidth = rectAreaLight.halfWidth;\n		vec3 halfHeight = rectAreaLight.halfHeight;\n		vec3 lightColor = rectAreaLight.color;\n		float roughness = material.roughness;\n		vec3 rectCoords[ 4 ];\n		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;\n		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;\n		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;\n		vec2 uv = LTC_Uv( normal, viewDir, roughness );\n		vec4 t1 = texture2D( ltc_1, uv );\n		vec4 t2 = texture2D( ltc_2, uv );\n		mat3 mInv = mat3(\n			vec3( t1.x, 0, t1.y ),\n			vec3(    0, 1,    0 ),\n			vec3( t1.z, 0, t1.w )\n		);\n		vec3 fresnel = ( material.specularColorBlended * t2.x + ( vec3( 1.0 ) - material.specularColorBlended ) * t2.y );\n		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );\n		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );\n	}\n#endif\nvoid RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {\n	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n	vec3 irradiance = dotNL * directLight.color;\n	#ifdef USE_CLEARCOAT\n		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );\n		vec3 ccIrradiance = dotNLcc * directLight.color;\n		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );\n	#endif\n	#ifdef USE_SHEEN\n \n 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );\n \n 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );\n 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );\n \n 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );\n \n 		irradiance *= sheenEnergyComp;\n \n 	#endif\n	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );\n	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );\n}\nvoid RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {\n	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );\n	#ifdef USE_SHEEN\n		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );\n		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;\n		diffuse *= sheenEnergyComp;\n	#endif\n	reflectedLight.indirectDiffuse += diffuse;\n}\nvoid RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {\n	#ifdef USE_CLEARCOAT\n		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );\n	#endif\n	#ifdef USE_SHEEN\n		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;\n 	#endif\n	vec3 singleScatteringDielectric = vec3( 0.0 );\n	vec3 multiScatteringDielectric = vec3( 0.0 );\n	vec3 singleScatteringMetallic = vec3( 0.0 );\n	vec3 multiScatteringMetallic = vec3( 0.0 );\n	#ifdef USE_IRIDESCENCE\n		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );\n		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );\n	#else\n		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );\n		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );\n	#endif\n	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );\n	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );\n	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;\n	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );\n	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;\n	vec3 indirectSpecular = radiance * singleScattering;\n	indirectSpecular += multiScattering * cosineWeightedIrradiance;\n	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;\n	#ifdef USE_SHEEN\n		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );\n		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;\n		indirectSpecular *= sheenEnergyComp;\n		indirectDiffuse *= sheenEnergyComp;\n	#endif\n	reflectedLight.indirectSpecular += indirectSpecular;\n	reflectedLight.indirectDiffuse += indirectDiffuse;\n}\n#define RE_Direct				RE_Direct_Physical\n#define RE_Direct_RectArea		RE_Direct_RectArea_Physical\n#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical\n#define RE_IndirectSpecular		RE_IndirectSpecular_Physical\nfloat computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {\n	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );\n}";
var lights_fragment_begin = "\nvec3 geometryPosition = - vViewPosition;\nvec3 geometryNormal = normal;\nvec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );\nvec3 geometryClearcoatNormal = vec3( 0.0 );\n#ifdef USE_CLEARCOAT\n	geometryClearcoatNormal = clearcoatNormal;\n#endif\n#ifdef USE_IRIDESCENCE\n	float dotNVi = saturate( dot( normal, geometryViewDir ) );\n	if ( material.iridescenceThickness == 0.0 ) {\n		material.iridescence = 0.0;\n	} else {\n		material.iridescence = saturate( material.iridescence );\n	}\n	if ( material.iridescence > 0.0 ) {\n		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );\n		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );\n		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );\n		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );\n	}\n#endif\nIncidentLight directLight;\n#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )\n	PointLight pointLight;\n	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0\n	PointLightShadow pointLightShadow;\n	#endif\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {\n		pointLight = pointLights[ i ];\n		getPointLightInfo( pointLight, geometryPosition, directLight );\n		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )\n		pointLightShadow = pointLightShadows[ i ];\n		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;\n		#endif\n		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )\n	SpotLight spotLight;\n	vec4 spotColor;\n	vec3 spotLightCoord;\n	bool inSpotLightMap;\n	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0\n	SpotLightShadow spotLightShadow;\n	#endif\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {\n		spotLight = spotLights[ i ];\n		getSpotLightInfo( spotLight, geometryPosition, directLight );\n		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )\n		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX\n		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )\n		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS\n		#else\n		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )\n		#endif\n		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )\n			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;\n			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );\n			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );\n			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;\n		#endif\n		#undef SPOT_LIGHT_MAP_INDEX\n		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )\n		spotLightShadow = spotLightShadows[ i ];\n		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;\n		#endif\n		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )\n	DirectionalLight directionalLight;\n	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n	DirectionalLightShadow directionalLightShadow;\n	#endif\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {\n		directionalLight = directionalLights[ i ];\n		getDirectionalLightInfo( directionalLight, directLight );\n		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )\n		directionalLightShadow = directionalLightShadows[ i ];\n		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n		#endif\n		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )\n	RectAreaLight rectAreaLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {\n		rectAreaLight = rectAreaLights[ i ];\n		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n	}\n	#pragma unroll_loop_end\n#endif\n#if defined( RE_IndirectDiffuse )\n	vec3 iblIrradiance = vec3( 0.0 );\n	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );\n	#if defined( USE_LIGHT_PROBES )\n		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );\n	#endif\n	#if ( NUM_HEMI_LIGHTS > 0 )\n		#pragma unroll_loop_start\n		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {\n			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );\n		}\n		#pragma unroll_loop_end\n	#endif\n#endif\n#if defined( RE_IndirectSpecular )\n	vec3 radiance = vec3( 0.0 );\n	vec3 clearcoatRadiance = vec3( 0.0 );\n#endif";
var lights_fragment_maps = "#if defined( RE_IndirectDiffuse )\n	#ifdef USE_LIGHTMAP\n		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );\n		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;\n		irradiance += lightMapIrradiance;\n	#endif\n	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )\n		iblIrradiance += getIBLIrradiance( geometryNormal );\n	#endif\n#endif\n#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )\n	#ifdef USE_ANISOTROPY\n		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );\n	#else\n		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );\n	#endif\n	#ifdef USE_CLEARCOAT\n		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );\n	#endif\n#endif";
var lights_fragment_end = "#if defined( RE_IndirectDiffuse )\n	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n#endif\n#if defined( RE_IndirectSpecular )\n	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n#endif";
var logdepthbuf_fragment = "#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )\n	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;\n#endif";
var logdepthbuf_pars_fragment = "#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )\n	uniform float logDepthBufFC;\n	varying float vFragDepth;\n	varying float vIsPerspective;\n#endif";
var logdepthbuf_pars_vertex = "#ifdef USE_LOGARITHMIC_DEPTH_BUFFER\n	varying float vFragDepth;\n	varying float vIsPerspective;\n#endif";
var logdepthbuf_vertex = "#ifdef USE_LOGARITHMIC_DEPTH_BUFFER\n	vFragDepth = 1.0 + gl_Position.w;\n	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );\n#endif";
var map_fragment = "#ifdef USE_MAP\n	vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n	#ifdef DECODE_VIDEO_TEXTURE\n		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );\n	#endif\n	diffuseColor *= sampledDiffuseColor;\n#endif";
var map_pars_fragment = "#ifdef USE_MAP\n	uniform sampler2D map;\n#endif";
var map_particle_fragment = "#if defined( USE_MAP ) || defined( USE_ALPHAMAP )\n	#if defined( USE_POINTS_UV )\n		vec2 uv = vUv;\n	#else\n		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;\n	#endif\n#endif\n#ifdef USE_MAP\n	diffuseColor *= texture2D( map, uv );\n#endif\n#ifdef USE_ALPHAMAP\n	diffuseColor.a *= texture2D( alphaMap, uv ).g;\n#endif";
var map_particle_pars_fragment = "#if defined( USE_POINTS_UV )\n	varying vec2 vUv;\n#else\n	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )\n		uniform mat3 uvTransform;\n	#endif\n#endif\n#ifdef USE_MAP\n	uniform sampler2D map;\n#endif\n#ifdef USE_ALPHAMAP\n	uniform sampler2D alphaMap;\n#endif";
var metalnessmap_fragment = "float metalnessFactor = metalness;\n#ifdef USE_METALNESSMAP\n	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );\n	metalnessFactor *= texelMetalness.b;\n#endif";
var metalnessmap_pars_fragment = "#ifdef USE_METALNESSMAP\n	uniform sampler2D metalnessMap;\n#endif";
var morphinstance_vertex = "#ifdef USE_INSTANCING_MORPH\n	float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;\n	}\n#endif";
var morphcolor_vertex = "#if defined( USE_MORPHCOLORS )\n	vColor *= morphTargetBaseInfluence;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		#if defined( USE_COLOR_ALPHA )\n			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];\n		#elif defined( USE_COLOR )\n			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];\n		#endif\n	}\n#endif";
var morphnormal_vertex = "#ifdef USE_MORPHNORMALS\n	objectNormal *= morphTargetBaseInfluence;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];\n	}\n#endif";
var morphtarget_pars_vertex = "#ifdef USE_MORPHTARGETS\n	#ifndef USE_INSTANCING_MORPH\n		uniform float morphTargetBaseInfluence;\n		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n	#endif\n	uniform sampler2DArray morphTargetsTexture;\n	uniform ivec2 morphTargetsTextureSize;\n	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {\n		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;\n		int y = texelIndex / morphTargetsTextureSize.x;\n		int x = texelIndex - y * morphTargetsTextureSize.x;\n		ivec3 morphUV = ivec3( x, y, morphTargetIndex );\n		return texelFetch( morphTargetsTexture, morphUV, 0 );\n	}\n#endif";
var morphtarget_vertex = "#ifdef USE_MORPHTARGETS\n	transformed *= morphTargetBaseInfluence;\n	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];\n	}\n#endif";
var normal_fragment_begin = "float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;\n#ifdef FLAT_SHADED\n	vec3 fdx = dFdx( vViewPosition );\n	vec3 fdy = dFdy( vViewPosition );\n	vec3 normal = normalize( cross( fdx, fdy ) );\n#else\n	vec3 normal = normalize( vNormal );\n	#ifdef DOUBLE_SIDED\n		normal *= faceDirection;\n	#endif\n#endif\n#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )\n	#ifdef USE_TANGENT\n		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );\n	#else\n		mat3 tbn = getTangentFrame( - vViewPosition, normal,\n		#if defined( USE_NORMALMAP )\n			vNormalMapUv\n		#elif defined( USE_CLEARCOAT_NORMALMAP )\n			vClearcoatNormalMapUv\n		#else\n			vUv\n		#endif\n		);\n	#endif\n	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )\n		tbn[0] *= faceDirection;\n		tbn[1] *= faceDirection;\n	#endif\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	#ifdef USE_TANGENT\n		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );\n	#else\n		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );\n	#endif\n	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )\n		tbn2[0] *= faceDirection;\n		tbn2[1] *= faceDirection;\n	#endif\n#endif\nvec3 nonPerturbedNormal = normal;";
var normal_fragment_maps = "#ifdef USE_NORMALMAP_OBJECTSPACE\n	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n	#ifdef FLIP_SIDED\n		normal = - normal;\n	#endif\n	#ifdef DOUBLE_SIDED\n		normal = normal * faceDirection;\n	#endif\n	normal = normalize( normalMatrix * normal );\n#elif defined( USE_NORMALMAP_TANGENTSPACE )\n	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n	mapN.xy *= normalScale;\n	normal = normalize( tbn * mapN );\n#elif defined( USE_BUMPMAP )\n	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );\n#endif";
var normal_pars_fragment = "#ifndef FLAT_SHADED\n	varying vec3 vNormal;\n	#ifdef USE_TANGENT\n		varying vec3 vTangent;\n		varying vec3 vBitangent;\n	#endif\n#endif";
var normal_pars_vertex = "#ifndef FLAT_SHADED\n	varying vec3 vNormal;\n	#ifdef USE_TANGENT\n		varying vec3 vTangent;\n		varying vec3 vBitangent;\n	#endif\n#endif";
var normal_vertex = "#ifndef FLAT_SHADED\n	vNormal = normalize( transformedNormal );\n	#ifdef USE_TANGENT\n		vTangent = normalize( transformedTangent );\n		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );\n	#endif\n#endif";
var normalmap_pars_fragment = "#ifdef USE_NORMALMAP\n	uniform sampler2D normalMap;\n	uniform vec2 normalScale;\n#endif\n#ifdef USE_NORMALMAP_OBJECTSPACE\n	uniform mat3 normalMatrix;\n#endif\n#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )\n	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {\n		vec3 q0 = dFdx( eye_pos.xyz );\n		vec3 q1 = dFdy( eye_pos.xyz );\n		vec2 st0 = dFdx( uv.st );\n		vec2 st1 = dFdy( uv.st );\n		vec3 N = surf_norm;\n		vec3 q1perp = cross( q1, N );\n		vec3 q0perp = cross( N, q0 );\n		vec3 T = q1perp * st0.x + q0perp * st1.x;\n		vec3 B = q1perp * st0.y + q0perp * st1.y;\n		float det = max( dot( T, T ), dot( B, B ) );\n		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );\n		return mat3( T * scale, B * scale, N );\n	}\n#endif";
var clearcoat_normal_fragment_begin = "#ifdef USE_CLEARCOAT\n	vec3 clearcoatNormal = nonPerturbedNormal;\n#endif";
var clearcoat_normal_fragment_maps = "#ifdef USE_CLEARCOAT_NORMALMAP\n	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;\n	clearcoatMapN.xy *= clearcoatNormalScale;\n	clearcoatNormal = normalize( tbn2 * clearcoatMapN );\n#endif";
var clearcoat_pars_fragment = "#ifdef USE_CLEARCOATMAP\n	uniform sampler2D clearcoatMap;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	uniform sampler2D clearcoatNormalMap;\n	uniform vec2 clearcoatNormalScale;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	uniform sampler2D clearcoatRoughnessMap;\n#endif";
var iridescence_pars_fragment = "#ifdef USE_IRIDESCENCEMAP\n	uniform sampler2D iridescenceMap;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	uniform sampler2D iridescenceThicknessMap;\n#endif";
var opaque_fragment = "#ifdef OPAQUE\ndiffuseColor.a = 1.0;\n#endif\n#ifdef USE_TRANSMISSION\ndiffuseColor.a *= material.transmissionAlpha;\n#endif\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );";
var packing = "vec3 packNormalToRGB( const in vec3 normal ) {\n	return normalize( normal ) * 0.5 + 0.5;\n}\nvec3 unpackRGBToNormal( const in vec3 rgb ) {\n	return 2.0 * rgb.xyz - 1.0;\n}\nconst float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;\nconst float Inv255 = 1. / 255.;\nconst vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );\nconst vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );\nconst vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );\nconst vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );\nvec4 packDepthToRGBA( const in float v ) {\n	if( v <= 0.0 )\n		return vec4( 0., 0., 0., 0. );\n	if( v >= 1.0 )\n		return vec4( 1., 1., 1., 1. );\n	float vuf;\n	float af = modf( v * PackFactors.a, vuf );\n	float bf = modf( vuf * ShiftRight8, vuf );\n	float gf = modf( vuf * ShiftRight8, vuf );\n	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );\n}\nvec3 packDepthToRGB( const in float v ) {\n	if( v <= 0.0 )\n		return vec3( 0., 0., 0. );\n	if( v >= 1.0 )\n		return vec3( 1., 1., 1. );\n	float vuf;\n	float bf = modf( v * PackFactors.b, vuf );\n	float gf = modf( vuf * ShiftRight8, vuf );\n	return vec3( vuf * Inv255, gf * PackUpscale, bf );\n}\nvec2 packDepthToRG( const in float v ) {\n	if( v <= 0.0 )\n		return vec2( 0., 0. );\n	if( v >= 1.0 )\n		return vec2( 1., 1. );\n	float vuf;\n	float gf = modf( v * 256., vuf );\n	return vec2( vuf * Inv255, gf );\n}\nfloat unpackRGBAToDepth( const in vec4 v ) {\n	return dot( v, UnpackFactors4 );\n}\nfloat unpackRGBToDepth( const in vec3 v ) {\n	return dot( v, UnpackFactors3 );\n}\nfloat unpackRGToDepth( const in vec2 v ) {\n	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;\n}\nvec4 pack2HalfToRGBA( const in vec2 v ) {\n	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );\n	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );\n}\nvec2 unpackRGBATo2Half( const in vec4 v ) {\n	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );\n}\nfloat viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {\n	return ( viewZ + near ) / ( near - far );\n}\nfloat orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {\n	return depth * ( near - far ) - near;\n}\nfloat viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {\n	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );\n}\nfloat perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {\n	return ( near * far ) / ( ( far - near ) * depth - far );\n}";
var premultiplied_alpha_fragment = "#ifdef PREMULTIPLIED_ALPHA\n	gl_FragColor.rgb *= gl_FragColor.a;\n#endif";
var project_vertex = "vec4 mvPosition = vec4( transformed, 1.0 );\n#ifdef USE_BATCHING\n	mvPosition = batchingMatrix * mvPosition;\n#endif\n#ifdef USE_INSTANCING\n	mvPosition = instanceMatrix * mvPosition;\n#endif\nmvPosition = modelViewMatrix * mvPosition;\ngl_Position = projectionMatrix * mvPosition;";
var dithering_fragment = "#ifdef DITHERING\n	gl_FragColor.rgb = dithering( gl_FragColor.rgb );\n#endif";
var dithering_pars_fragment = "#ifdef DITHERING\n	vec3 dithering( vec3 color ) {\n		float grid_position = rand( gl_FragCoord.xy );\n		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );\n		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );\n		return color + dither_shift_RGB;\n	}\n#endif";
var roughnessmap_fragment = "float roughnessFactor = roughness;\n#ifdef USE_ROUGHNESSMAP\n	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );\n	roughnessFactor *= texelRoughness.g;\n#endif";
var roughnessmap_pars_fragment = "#ifdef USE_ROUGHNESSMAP\n	uniform sampler2D roughnessMap;\n#endif";
var shadowmap_pars_fragment = "#if NUM_SPOT_LIGHT_COORDS > 0\n	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];\n#endif\n#if NUM_SPOT_LIGHT_MAPS > 0\n	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];\n#endif\n#ifdef USE_SHADOWMAP\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n		#if defined( SHADOWMAP_TYPE_PCF )\n			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];\n		#else\n			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];\n		#endif\n		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];\n		struct DirectionalLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_SPOT_LIGHT_SHADOWS > 0\n		#if defined( SHADOWMAP_TYPE_PCF )\n			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];\n		#else\n			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];\n		#endif\n		struct SpotLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n		#if defined( SHADOWMAP_TYPE_PCF )\n			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];\n		#elif defined( SHADOWMAP_TYPE_BASIC )\n			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];\n		#endif\n		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];\n		struct PointLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n			float shadowCameraNear;\n			float shadowCameraFar;\n		};\n		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];\n	#endif\n	#if defined( SHADOWMAP_TYPE_PCF )\n		float interleavedGradientNoise( vec2 position ) {\n			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );\n		}\n		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {\n			const float goldenAngle = 2.399963229728653;\n			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );\n			float theta = float( sampleIndex ) * goldenAngle + phi;\n			return vec2( cos( theta ), sin( theta ) ) * r;\n		}\n	#endif\n	#if defined( SHADOWMAP_TYPE_PCF )\n		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {\n			float shadow = 1.0;\n			shadowCoord.xyz /= shadowCoord.w;\n			shadowCoord.z += shadowBias;\n			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;\n			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;\n			if ( frustumTest ) {\n				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;\n				float radius = shadowRadius * texelSize.x;\n				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * 6.28318530718;\n				shadow = (\n					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +\n					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +\n					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +\n					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +\n					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )\n				) * 0.2;\n			}\n			return mix( 1.0, shadow, shadowIntensity );\n		}\n	#elif defined( SHADOWMAP_TYPE_VSM )\n		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {\n			float shadow = 1.0;\n			shadowCoord.xyz /= shadowCoord.w;\n			shadowCoord.z += shadowBias;\n			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;\n			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;\n			if ( frustumTest ) {\n				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;\n				float mean = distribution.x;\n				float variance = distribution.y * distribution.y;\n				#ifdef USE_REVERSED_DEPTH_BUFFER\n					float hard_shadow = step( mean, shadowCoord.z );\n				#else\n					float hard_shadow = step( shadowCoord.z, mean );\n				#endif\n				if ( hard_shadow == 1.0 ) {\n					shadow = 1.0;\n				} else {\n					variance = max( variance, 0.0000001 );\n					float d = shadowCoord.z - mean;\n					float p_max = variance / ( variance + d * d );\n					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );\n					shadow = max( hard_shadow, p_max );\n				}\n			}\n			return mix( 1.0, shadow, shadowIntensity );\n		}\n	#else\n		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {\n			float shadow = 1.0;\n			shadowCoord.xyz /= shadowCoord.w;\n			shadowCoord.z += shadowBias;\n			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;\n			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;\n			if ( frustumTest ) {\n				float depth = texture2D( shadowMap, shadowCoord.xy ).r;\n				#ifdef USE_REVERSED_DEPTH_BUFFER\n					shadow = step( depth, shadowCoord.z );\n				#else\n					shadow = step( shadowCoord.z, depth );\n				#endif\n			}\n			return mix( 1.0, shadow, shadowIntensity );\n		}\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n	#if defined( SHADOWMAP_TYPE_PCF )\n	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {\n		float shadow = 1.0;\n		vec3 lightToPosition = shadowCoord.xyz;\n		vec3 bd3D = normalize( lightToPosition );\n		vec3 absVec = abs( lightToPosition );\n		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );\n		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {\n			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );\n			dp += shadowBias;\n			float texelSize = shadowRadius / shadowMapSize.x;\n			vec3 absDir = abs( bd3D );\n			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );\n			tangent = normalize( cross( bd3D, tangent ) );\n			vec3 bitangent = cross( bd3D, tangent );\n			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * 6.28318530718;\n			shadow = (\n				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 0, 5, phi ).x + bitangent * vogelDiskSample( 0, 5, phi ).y ) * texelSize, dp ) ) +\n				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 1, 5, phi ).x + bitangent * vogelDiskSample( 1, 5, phi ).y ) * texelSize, dp ) ) +\n				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 2, 5, phi ).x + bitangent * vogelDiskSample( 2, 5, phi ).y ) * texelSize, dp ) ) +\n				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 3, 5, phi ).x + bitangent * vogelDiskSample( 3, 5, phi ).y ) * texelSize, dp ) ) +\n				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 4, 5, phi ).x + bitangent * vogelDiskSample( 4, 5, phi ).y ) * texelSize, dp ) )\n			) * 0.2;\n		}\n		return mix( 1.0, shadow, shadowIntensity );\n	}\n	#elif defined( SHADOWMAP_TYPE_BASIC )\n	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {\n		float shadow = 1.0;\n		vec3 lightToPosition = shadowCoord.xyz;\n		vec3 bd3D = normalize( lightToPosition );\n		vec3 absVec = abs( lightToPosition );\n		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );\n		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {\n			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );\n			dp += shadowBias;\n			float depth = textureCube( shadowMap, bd3D ).r;\n			#ifdef USE_REVERSED_DEPTH_BUFFER\n				shadow = step( depth, dp );\n			#else\n				shadow = step( dp, depth );\n			#endif\n		}\n		return mix( 1.0, shadow, shadowIntensity );\n	}\n	#endif\n	#endif\n#endif";
var shadowmap_pars_vertex = "#if NUM_SPOT_LIGHT_COORDS > 0\n	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];\n	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];\n#endif\n#ifdef USE_SHADOWMAP\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];\n		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];\n		struct DirectionalLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_SPOT_LIGHT_SHADOWS > 0\n		struct SpotLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n		};\n		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];\n		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];\n		struct PointLightShadow {\n			float shadowIntensity;\n			float shadowBias;\n			float shadowNormalBias;\n			float shadowRadius;\n			vec2 shadowMapSize;\n			float shadowCameraNear;\n			float shadowCameraFar;\n		};\n		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];\n	#endif\n#endif";
var shadowmap_vertex = "#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )\n	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n	vec4 shadowWorldPosition;\n#endif\n#if defined( USE_SHADOWMAP )\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n		#pragma unroll_loop_start\n		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {\n			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );\n			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;\n		}\n		#pragma unroll_loop_end\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0\n		#pragma unroll_loop_start\n		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {\n			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );\n			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;\n		}\n		#pragma unroll_loop_end\n	#endif\n#endif\n#if NUM_SPOT_LIGHT_COORDS > 0\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {\n		shadowWorldPosition = worldPosition;\n		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )\n			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;\n		#endif\n		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;\n	}\n	#pragma unroll_loop_end\n#endif";
var shadowmask_pars_fragment = "float getShadowMask() {\n	float shadow = 1.0;\n	#ifdef USE_SHADOWMAP\n	#if NUM_DIR_LIGHT_SHADOWS > 0\n	DirectionalLightShadow directionalLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {\n		directionalLight = directionalLightShadows[ i ];\n		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n	}\n	#pragma unroll_loop_end\n	#endif\n	#if NUM_SPOT_LIGHT_SHADOWS > 0\n	SpotLightShadow spotLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {\n		spotLight = spotLightShadows[ i ];\n		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;\n	}\n	#pragma unroll_loop_end\n	#endif\n	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )\n	PointLightShadow pointLight;\n	#pragma unroll_loop_start\n	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {\n		pointLight = pointLightShadows[ i ];\n		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;\n	}\n	#pragma unroll_loop_end\n	#endif\n	#endif\n	return shadow;\n}";
var skinbase_vertex = "#ifdef USE_SKINNING\n	mat4 boneMatX = getBoneMatrix( skinIndex.x );\n	mat4 boneMatY = getBoneMatrix( skinIndex.y );\n	mat4 boneMatZ = getBoneMatrix( skinIndex.z );\n	mat4 boneMatW = getBoneMatrix( skinIndex.w );\n#endif";
var skinning_pars_vertex = "#ifdef USE_SKINNING\n	uniform mat4 bindMatrix;\n	uniform mat4 bindMatrixInverse;\n	uniform highp sampler2D boneTexture;\n	mat4 getBoneMatrix( const in float i ) {\n		int size = textureSize( boneTexture, 0 ).x;\n		int j = int( i ) * 4;\n		int x = j % size;\n		int y = j / size;\n		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );\n		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );\n		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );\n		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );\n		return mat4( v1, v2, v3, v4 );\n	}\n#endif";
var skinning_vertex = "#ifdef USE_SKINNING\n	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );\n	vec4 skinned = vec4( 0.0 );\n	skinned += boneMatX * skinVertex * skinWeight.x;\n	skinned += boneMatY * skinVertex * skinWeight.y;\n	skinned += boneMatZ * skinVertex * skinWeight.z;\n	skinned += boneMatW * skinVertex * skinWeight.w;\n	transformed = ( bindMatrixInverse * skinned ).xyz;\n#endif";
var skinnormal_vertex = "#ifdef USE_SKINNING\n	mat4 skinMatrix = mat4( 0.0 );\n	skinMatrix += skinWeight.x * boneMatX;\n	skinMatrix += skinWeight.y * boneMatY;\n	skinMatrix += skinWeight.z * boneMatZ;\n	skinMatrix += skinWeight.w * boneMatW;\n	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;\n	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;\n	#ifdef USE_TANGENT\n		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;\n	#endif\n#endif";
var specularmap_fragment = "float specularStrength;\n#ifdef USE_SPECULARMAP\n	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );\n	specularStrength = texelSpecular.r;\n#else\n	specularStrength = 1.0;\n#endif";
var specularmap_pars_fragment = "#ifdef USE_SPECULARMAP\n	uniform sampler2D specularMap;\n#endif";
var tonemapping_fragment = "#if defined( TONE_MAPPING )\n	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );\n#endif";
var tonemapping_pars_fragment = "#ifndef saturate\n#define saturate( a ) clamp( a, 0.0, 1.0 )\n#endif\nuniform float toneMappingExposure;\nvec3 LinearToneMapping( vec3 color ) {\n	return saturate( toneMappingExposure * color );\n}\nvec3 ReinhardToneMapping( vec3 color ) {\n	color *= toneMappingExposure;\n	return saturate( color / ( vec3( 1.0 ) + color ) );\n}\nvec3 CineonToneMapping( vec3 color ) {\n	color *= toneMappingExposure;\n	color = max( vec3( 0.0 ), color - 0.004 );\n	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );\n}\nvec3 RRTAndODTFit( vec3 v ) {\n	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;\n	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;\n	return a / b;\n}\nvec3 ACESFilmicToneMapping( vec3 color ) {\n	const mat3 ACESInputMat = mat3(\n		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),\n		vec3( 0.04823, 0.01566, 0.83777 )\n	);\n	const mat3 ACESOutputMat = mat3(\n		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),\n		vec3( -0.07367, -0.00605,  1.07602 )\n	);\n	color *= toneMappingExposure / 0.6;\n	color = ACESInputMat * color;\n	color = RRTAndODTFit( color );\n	color = ACESOutputMat * color;\n	return saturate( color );\n}\nconst mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(\n	vec3( 1.6605, - 0.1246, - 0.0182 ),\n	vec3( - 0.5876, 1.1329, - 0.1006 ),\n	vec3( - 0.0728, - 0.0083, 1.1187 )\n);\nconst mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(\n	vec3( 0.6274, 0.0691, 0.0164 ),\n	vec3( 0.3293, 0.9195, 0.0880 ),\n	vec3( 0.0433, 0.0113, 0.8956 )\n);\nvec3 agxDefaultContrastApprox( vec3 x ) {\n	vec3 x2 = x * x;\n	vec3 x4 = x2 * x2;\n	return + 15.5 * x4 * x2\n		- 40.14 * x4 * x\n		+ 31.96 * x4\n		- 6.868 * x2 * x\n		+ 0.4298 * x2\n		+ 0.1191 * x\n		- 0.00232;\n}\nvec3 AgXToneMapping( vec3 color ) {\n	const mat3 AgXInsetMatrix = mat3(\n		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),\n		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),\n		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )\n	);\n	const mat3 AgXOutsetMatrix = mat3(\n		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),\n		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),\n		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )\n	);\n	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;\n	color *= toneMappingExposure;\n	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;\n	color = AgXInsetMatrix * color;\n	color = max( color, 1e-10 );	color = log2( color );\n	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );\n	color = clamp( color, 0.0, 1.0 );\n	color = agxDefaultContrastApprox( color );\n	color = AgXOutsetMatrix * color;\n	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );\n	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;\n	color = clamp( color, 0.0, 1.0 );\n	return color;\n}\nvec3 NeutralToneMapping( vec3 color ) {\n	const float StartCompression = 0.8 - 0.04;\n	const float Desaturation = 0.15;\n	color *= toneMappingExposure;\n	float x = min( color.r, min( color.g, color.b ) );\n	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;\n	color -= offset;\n	float peak = max( color.r, max( color.g, color.b ) );\n	if ( peak < StartCompression ) return color;\n	float d = 1. - StartCompression;\n	float newPeak = 1. - d * d / ( peak + d - StartCompression );\n	color *= newPeak / peak;\n	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );\n	return mix( color, vec3( newPeak ), g );\n}\nvec3 CustomToneMapping( vec3 color ) { return color; }";
var transmission_fragment = "#ifdef USE_TRANSMISSION\n	material.transmission = transmission;\n	material.transmissionAlpha = 1.0;\n	material.thickness = thickness;\n	material.attenuationDistance = attenuationDistance;\n	material.attenuationColor = attenuationColor;\n	#ifdef USE_TRANSMISSIONMAP\n		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;\n	#endif\n	#ifdef USE_THICKNESSMAP\n		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;\n	#endif\n	vec3 pos = vWorldPosition;\n	vec3 v = normalize( cameraPosition - pos );\n	vec3 n = inverseTransformDirection( normal, viewMatrix );\n	vec4 transmitted = getIBLVolumeRefraction(\n		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,\n		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,\n		material.attenuationColor, material.attenuationDistance );\n	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );\n	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );\n#endif";
var transmission_pars_fragment = "#ifdef USE_TRANSMISSION\n	uniform float transmission;\n	uniform float thickness;\n	uniform float attenuationDistance;\n	uniform vec3 attenuationColor;\n	#ifdef USE_TRANSMISSIONMAP\n		uniform sampler2D transmissionMap;\n	#endif\n	#ifdef USE_THICKNESSMAP\n		uniform sampler2D thicknessMap;\n	#endif\n	uniform vec2 transmissionSamplerSize;\n	uniform sampler2D transmissionSamplerMap;\n	uniform mat4 modelMatrix;\n	uniform mat4 projectionMatrix;\n	varying vec3 vWorldPosition;\n	float w0( float a ) {\n		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );\n	}\n	float w1( float a ) {\n		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );\n	}\n	float w2( float a ){\n		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );\n	}\n	float w3( float a ) {\n		return ( 1.0 / 6.0 ) * ( a * a * a );\n	}\n	float g0( float a ) {\n		return w0( a ) + w1( a );\n	}\n	float g1( float a ) {\n		return w2( a ) + w3( a );\n	}\n	float h0( float a ) {\n		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );\n	}\n	float h1( float a ) {\n		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );\n	}\n	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {\n		uv = uv * texelSize.zw + 0.5;\n		vec2 iuv = floor( uv );\n		vec2 fuv = fract( uv );\n		float g0x = g0( fuv.x );\n		float g1x = g1( fuv.x );\n		float h0x = h0( fuv.x );\n		float h1x = h1( fuv.x );\n		float h0y = h0( fuv.y );\n		float h1y = h1( fuv.y );\n		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;\n		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;\n		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;\n		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;\n		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +\n			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );\n	}\n	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {\n		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );\n		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );\n		vec2 fLodSizeInv = 1.0 / fLodSize;\n		vec2 cLodSizeInv = 1.0 / cLodSize;\n		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );\n		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );\n		return mix( fSample, cSample, fract( lod ) );\n	}\n	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {\n		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );\n		vec3 modelScale;\n		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );\n		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );\n		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );\n		return normalize( refractionVector ) * thickness * modelScale;\n	}\n	float applyIorToRoughness( const in float roughness, const in float ior ) {\n		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );\n	}\n	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {\n		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );\n		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );\n	}\n	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {\n		if ( isinf( attenuationDistance ) ) {\n			return vec3( 1.0 );\n		} else {\n			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;\n			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;\n		}\n	}\n	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,\n		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,\n		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,\n		const in vec3 attenuationColor, const in float attenuationDistance ) {\n		vec4 transmittedLight;\n		vec3 transmittance;\n		#ifdef USE_DISPERSION\n			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;\n			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );\n			for ( int i = 0; i < 3; i ++ ) {\n				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );\n				vec3 refractedRayExit = position + transmissionRay;\n				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );\n				vec2 refractionCoords = ndcPos.xy / ndcPos.w;\n				refractionCoords += 1.0;\n				refractionCoords /= 2.0;\n				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );\n				transmittedLight[ i ] = transmissionSample[ i ];\n				transmittedLight.a += transmissionSample.a;\n				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];\n			}\n			transmittedLight.a /= 3.0;\n		#else\n			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );\n			vec3 refractedRayExit = position + transmissionRay;\n			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );\n			vec2 refractionCoords = ndcPos.xy / ndcPos.w;\n			refractionCoords += 1.0;\n			refractionCoords /= 2.0;\n			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );\n			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );\n		#endif\n		vec3 attenuatedColor = transmittance * transmittedLight.rgb;\n		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );\n		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;\n		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );\n	}\n#endif";
var uv_pars_fragment = "#if defined( USE_UV ) || defined( USE_ANISOTROPY )\n	varying vec2 vUv;\n#endif\n#ifdef USE_MAP\n	varying vec2 vMapUv;\n#endif\n#ifdef USE_ALPHAMAP\n	varying vec2 vAlphaMapUv;\n#endif\n#ifdef USE_LIGHTMAP\n	varying vec2 vLightMapUv;\n#endif\n#ifdef USE_AOMAP\n	varying vec2 vAoMapUv;\n#endif\n#ifdef USE_BUMPMAP\n	varying vec2 vBumpMapUv;\n#endif\n#ifdef USE_NORMALMAP\n	varying vec2 vNormalMapUv;\n#endif\n#ifdef USE_EMISSIVEMAP\n	varying vec2 vEmissiveMapUv;\n#endif\n#ifdef USE_METALNESSMAP\n	varying vec2 vMetalnessMapUv;\n#endif\n#ifdef USE_ROUGHNESSMAP\n	varying vec2 vRoughnessMapUv;\n#endif\n#ifdef USE_ANISOTROPYMAP\n	varying vec2 vAnisotropyMapUv;\n#endif\n#ifdef USE_CLEARCOATMAP\n	varying vec2 vClearcoatMapUv;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	varying vec2 vClearcoatNormalMapUv;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	varying vec2 vClearcoatRoughnessMapUv;\n#endif\n#ifdef USE_IRIDESCENCEMAP\n	varying vec2 vIridescenceMapUv;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	varying vec2 vIridescenceThicknessMapUv;\n#endif\n#ifdef USE_SHEEN_COLORMAP\n	varying vec2 vSheenColorMapUv;\n#endif\n#ifdef USE_SHEEN_ROUGHNESSMAP\n	varying vec2 vSheenRoughnessMapUv;\n#endif\n#ifdef USE_SPECULARMAP\n	varying vec2 vSpecularMapUv;\n#endif\n#ifdef USE_SPECULAR_COLORMAP\n	varying vec2 vSpecularColorMapUv;\n#endif\n#ifdef USE_SPECULAR_INTENSITYMAP\n	varying vec2 vSpecularIntensityMapUv;\n#endif\n#ifdef USE_TRANSMISSIONMAP\n	uniform mat3 transmissionMapTransform;\n	varying vec2 vTransmissionMapUv;\n#endif\n#ifdef USE_THICKNESSMAP\n	uniform mat3 thicknessMapTransform;\n	varying vec2 vThicknessMapUv;\n#endif";
var uv_pars_vertex = "#if defined( USE_UV ) || defined( USE_ANISOTROPY )\n	varying vec2 vUv;\n#endif\n#ifdef USE_MAP\n	uniform mat3 mapTransform;\n	varying vec2 vMapUv;\n#endif\n#ifdef USE_ALPHAMAP\n	uniform mat3 alphaMapTransform;\n	varying vec2 vAlphaMapUv;\n#endif\n#ifdef USE_LIGHTMAP\n	uniform mat3 lightMapTransform;\n	varying vec2 vLightMapUv;\n#endif\n#ifdef USE_AOMAP\n	uniform mat3 aoMapTransform;\n	varying vec2 vAoMapUv;\n#endif\n#ifdef USE_BUMPMAP\n	uniform mat3 bumpMapTransform;\n	varying vec2 vBumpMapUv;\n#endif\n#ifdef USE_NORMALMAP\n	uniform mat3 normalMapTransform;\n	varying vec2 vNormalMapUv;\n#endif\n#ifdef USE_DISPLACEMENTMAP\n	uniform mat3 displacementMapTransform;\n	varying vec2 vDisplacementMapUv;\n#endif\n#ifdef USE_EMISSIVEMAP\n	uniform mat3 emissiveMapTransform;\n	varying vec2 vEmissiveMapUv;\n#endif\n#ifdef USE_METALNESSMAP\n	uniform mat3 metalnessMapTransform;\n	varying vec2 vMetalnessMapUv;\n#endif\n#ifdef USE_ROUGHNESSMAP\n	uniform mat3 roughnessMapTransform;\n	varying vec2 vRoughnessMapUv;\n#endif\n#ifdef USE_ANISOTROPYMAP\n	uniform mat3 anisotropyMapTransform;\n	varying vec2 vAnisotropyMapUv;\n#endif\n#ifdef USE_CLEARCOATMAP\n	uniform mat3 clearcoatMapTransform;\n	varying vec2 vClearcoatMapUv;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	uniform mat3 clearcoatNormalMapTransform;\n	varying vec2 vClearcoatNormalMapUv;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	uniform mat3 clearcoatRoughnessMapTransform;\n	varying vec2 vClearcoatRoughnessMapUv;\n#endif\n#ifdef USE_SHEEN_COLORMAP\n	uniform mat3 sheenColorMapTransform;\n	varying vec2 vSheenColorMapUv;\n#endif\n#ifdef USE_SHEEN_ROUGHNESSMAP\n	uniform mat3 sheenRoughnessMapTransform;\n	varying vec2 vSheenRoughnessMapUv;\n#endif\n#ifdef USE_IRIDESCENCEMAP\n	uniform mat3 iridescenceMapTransform;\n	varying vec2 vIridescenceMapUv;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	uniform mat3 iridescenceThicknessMapTransform;\n	varying vec2 vIridescenceThicknessMapUv;\n#endif\n#ifdef USE_SPECULARMAP\n	uniform mat3 specularMapTransform;\n	varying vec2 vSpecularMapUv;\n#endif\n#ifdef USE_SPECULAR_COLORMAP\n	uniform mat3 specularColorMapTransform;\n	varying vec2 vSpecularColorMapUv;\n#endif\n#ifdef USE_SPECULAR_INTENSITYMAP\n	uniform mat3 specularIntensityMapTransform;\n	varying vec2 vSpecularIntensityMapUv;\n#endif\n#ifdef USE_TRANSMISSIONMAP\n	uniform mat3 transmissionMapTransform;\n	varying vec2 vTransmissionMapUv;\n#endif\n#ifdef USE_THICKNESSMAP\n	uniform mat3 thicknessMapTransform;\n	varying vec2 vThicknessMapUv;\n#endif";
var uv_vertex = "#if defined( USE_UV ) || defined( USE_ANISOTROPY )\n	vUv = vec3( uv, 1 ).xy;\n#endif\n#ifdef USE_MAP\n	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_ALPHAMAP\n	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_LIGHTMAP\n	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_AOMAP\n	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_BUMPMAP\n	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_NORMALMAP\n	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_DISPLACEMENTMAP\n	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_EMISSIVEMAP\n	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_METALNESSMAP\n	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_ROUGHNESSMAP\n	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_ANISOTROPYMAP\n	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_CLEARCOATMAP\n	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_CLEARCOAT_NORMALMAP\n	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_CLEARCOAT_ROUGHNESSMAP\n	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_IRIDESCENCEMAP\n	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_IRIDESCENCE_THICKNESSMAP\n	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SHEEN_COLORMAP\n	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SHEEN_ROUGHNESSMAP\n	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SPECULARMAP\n	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SPECULAR_COLORMAP\n	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_SPECULAR_INTENSITYMAP\n	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_TRANSMISSIONMAP\n	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;\n#endif\n#ifdef USE_THICKNESSMAP\n	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;\n#endif";
var worldpos_vertex = "#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\n	vec4 worldPosition = vec4( transformed, 1.0 );\n	#ifdef USE_BATCHING\n		worldPosition = batchingMatrix * worldPosition;\n	#endif\n	#ifdef USE_INSTANCING\n		worldPosition = instanceMatrix * worldPosition;\n	#endif\n	worldPosition = modelMatrix * worldPosition;\n#endif";
var vertex$h = "varying vec2 vUv;\nuniform mat3 uvTransform;\nvoid main() {\n	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;\n	gl_Position = vec4( position.xy, 1.0, 1.0 );\n}";
var fragment$h = "uniform sampler2D t2D;\nuniform float backgroundIntensity;\nvarying vec2 vUv;\nvoid main() {\n	vec4 texColor = texture2D( t2D, vUv );\n	#ifdef DECODE_VIDEO_TEXTURE\n		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );\n	#endif\n	texColor.rgb *= backgroundIntensity;\n	gl_FragColor = texColor;\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$g = "varying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vWorldDirection = transformDirection( position, modelMatrix );\n	#include <begin_vertex>\n	#include <project_vertex>\n	gl_Position.z = gl_Position.w;\n}";
var fragment$g = "#ifdef ENVMAP_TYPE_CUBE\n	uniform samplerCube envMap;\n#elif defined( ENVMAP_TYPE_CUBE_UV )\n	uniform sampler2D envMap;\n#endif\nuniform float flipEnvMap;\nuniform float backgroundBlurriness;\nuniform float backgroundIntensity;\nuniform mat3 backgroundRotation;\nvarying vec3 vWorldDirection;\n#include <cube_uv_reflection_fragment>\nvoid main() {\n	#ifdef ENVMAP_TYPE_CUBE\n		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );\n	#elif defined( ENVMAP_TYPE_CUBE_UV )\n		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );\n	#else\n		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );\n	#endif\n	texColor.rgb *= backgroundIntensity;\n	gl_FragColor = texColor;\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$f = "varying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vWorldDirection = transformDirection( position, modelMatrix );\n	#include <begin_vertex>\n	#include <project_vertex>\n	gl_Position.z = gl_Position.w;\n}";
var fragment$f = "uniform samplerCube tCube;\nuniform float tFlip;\nuniform float opacity;\nvarying vec3 vWorldDirection;\nvoid main() {\n	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );\n	gl_FragColor = texColor;\n	gl_FragColor.a *= opacity;\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$e = "#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvarying vec2 vHighPrecisionZW;\nvoid main() {\n	#include <uv_vertex>\n	#include <batching_vertex>\n	#include <skinbase_vertex>\n	#include <morphinstance_vertex>\n	#ifdef USE_DISPLACEMENTMAP\n		#include <beginnormal_vertex>\n		#include <morphnormal_vertex>\n		#include <skinnormal_vertex>\n	#endif\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vHighPrecisionZW = gl_Position.zw;\n}";
var fragment$e = "#if DEPTH_PACKING == 3200\n	uniform float opacity;\n#endif\n#include <common>\n#include <packing>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvarying vec2 vHighPrecisionZW;\nvoid main() {\n	vec4 diffuseColor = vec4( 1.0 );\n	#include <clipping_planes_fragment>\n	#if DEPTH_PACKING == 3200\n		diffuseColor.a = opacity;\n	#endif\n	#include <map_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <logdepthbuf_fragment>\n	#ifdef USE_REVERSED_DEPTH_BUFFER\n		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];\n	#else\n		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;\n	#endif\n	#if DEPTH_PACKING == 3200\n		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );\n	#elif DEPTH_PACKING == 3201\n		gl_FragColor = packDepthToRGBA( fragCoordZ );\n	#elif DEPTH_PACKING == 3202\n		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );\n	#elif DEPTH_PACKING == 3203\n		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );\n	#endif\n}";
var vertex$d = "#define DISTANCE\nvarying vec3 vWorldPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <batching_vertex>\n	#include <skinbase_vertex>\n	#include <morphinstance_vertex>\n	#ifdef USE_DISPLACEMENTMAP\n		#include <beginnormal_vertex>\n		#include <morphnormal_vertex>\n		#include <skinnormal_vertex>\n	#endif\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <worldpos_vertex>\n	#include <clipping_planes_vertex>\n	vWorldPosition = worldPosition.xyz;\n}";
var fragment$d = "#define DISTANCE\nuniform vec3 referencePosition;\nuniform float nearDistance;\nuniform float farDistance;\nvarying vec3 vWorldPosition;\n#include <common>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main () {\n	vec4 diffuseColor = vec4( 1.0 );\n	#include <clipping_planes_fragment>\n	#include <map_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	float dist = length( vWorldPosition - referencePosition );\n	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );\n	dist = saturate( dist );\n	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );\n}";
var vertex$c = "varying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vWorldDirection = transformDirection( position, modelMatrix );\n	#include <begin_vertex>\n	#include <project_vertex>\n}";
var fragment$c = "uniform sampler2D tEquirect;\nvarying vec3 vWorldDirection;\n#include <common>\nvoid main() {\n	vec3 direction = normalize( vWorldDirection );\n	vec2 sampleUV = equirectUv( direction );\n	gl_FragColor = texture2D( tEquirect, sampleUV );\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n}";
var vertex$b = "uniform float scale;\nattribute float lineDistance;\nvarying float vLineDistance;\n#include <common>\n#include <uv_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	vLineDistance = scale * lineDistance;\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <fog_vertex>\n}";
var fragment$b = "uniform vec3 diffuse;\nuniform float opacity;\nuniform float dashSize;\nuniform float totalSize;\nvarying float vLineDistance;\n#include <common>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	if ( mod( vLineDistance, totalSize ) > dashSize ) {\n		discard;\n	}\n	vec3 outgoingLight = vec3( 0.0 );\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	outgoingLight = diffuseColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n}";
var vertex$a = "#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <envmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )\n		#include <beginnormal_vertex>\n		#include <morphnormal_vertex>\n		#include <skinbase_vertex>\n		#include <skinnormal_vertex>\n		#include <defaultnormal_vertex>\n	#endif\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <worldpos_vertex>\n	#include <envmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$a = "uniform vec3 diffuse;\nuniform float opacity;\n#ifndef FLAT_SHADED\n	varying vec3 vNormal;\n#endif\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <specularmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <specularmap_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	#ifdef USE_LIGHTMAP\n		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );\n		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;\n	#else\n		reflectedLight.indirectDiffuse += vec3( 1.0 );\n	#endif\n	#include <aomap_fragment>\n	reflectedLight.indirectDiffuse *= diffuseColor.rgb;\n	vec3 outgoingLight = reflectedLight.indirectDiffuse;\n	#include <envmap_fragment>\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$9 = "#define LAMBERT\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <envmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <envmap_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$9 = "#define LAMBERT\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform float opacity;\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_lambert_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <specularmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <specularmap_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_lambert_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n	#include <envmap_fragment>\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$8 = "#define MATCAP\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <color_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <fog_vertex>\n	vViewPosition = - mvPosition.xyz;\n}";
var fragment$8 = "#define MATCAP\nuniform vec3 diffuse;\nuniform float opacity;\nuniform sampler2D matcap;\nvarying vec3 vViewPosition;\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <fog_pars_fragment>\n#include <normal_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	vec3 viewDir = normalize( vViewPosition );\n	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );\n	vec3 y = cross( viewDir, x );\n	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;\n	#ifdef USE_MATCAP\n		vec4 matcapColor = texture2D( matcap, uv );\n	#else\n		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );\n	#endif\n	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$7 = "#define NORMAL\n#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )\n	varying vec3 vViewPosition;\n#endif\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphinstance_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )\n	vViewPosition = - mvPosition.xyz;\n#endif\n}";
var fragment$7 = "#define NORMAL\nuniform float opacity;\n#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )\n	varying vec3 vViewPosition;\n#endif\n#include <uv_pars_fragment>\n#include <normal_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );\n	#include <clipping_planes_fragment>\n	#include <logdepthbuf_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );\n	#ifdef OPAQUE\n		gl_FragColor.a = 1.0;\n	#endif\n}";
var vertex$6 = "#define PHONG\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <envmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphinstance_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <envmap_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$6 = "#define PHONG\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform vec3 specular;\nuniform float shininess;\nuniform float opacity;\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_phong_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <specularmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <specularmap_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_phong_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;\n	#include <envmap_fragment>\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$5 = "#define STANDARD\nvarying vec3 vViewPosition;\n#ifdef USE_TRANSMISSION\n	varying vec3 vWorldPosition;\n#endif\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n#ifdef USE_TRANSMISSION\n	vWorldPosition = worldPosition.xyz;\n#endif\n}";
var fragment$5 = "#define STANDARD\n#ifdef PHYSICAL\n	#define IOR\n	#define USE_SPECULAR\n#endif\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform float roughness;\nuniform float metalness;\nuniform float opacity;\n#ifdef IOR\n	uniform float ior;\n#endif\n#ifdef USE_SPECULAR\n	uniform float specularIntensity;\n	uniform vec3 specularColor;\n	#ifdef USE_SPECULAR_COLORMAP\n		uniform sampler2D specularColorMap;\n	#endif\n	#ifdef USE_SPECULAR_INTENSITYMAP\n		uniform sampler2D specularIntensityMap;\n	#endif\n#endif\n#ifdef USE_CLEARCOAT\n	uniform float clearcoat;\n	uniform float clearcoatRoughness;\n#endif\n#ifdef USE_DISPERSION\n	uniform float dispersion;\n#endif\n#ifdef USE_IRIDESCENCE\n	uniform float iridescence;\n	uniform float iridescenceIOR;\n	uniform float iridescenceThicknessMinimum;\n	uniform float iridescenceThicknessMaximum;\n#endif\n#ifdef USE_SHEEN\n	uniform vec3 sheenColor;\n	uniform float sheenRoughness;\n	#ifdef USE_SHEEN_COLORMAP\n		uniform sampler2D sheenColorMap;\n	#endif\n	#ifdef USE_SHEEN_ROUGHNESSMAP\n		uniform sampler2D sheenRoughnessMap;\n	#endif\n#endif\n#ifdef USE_ANISOTROPY\n	uniform vec2 anisotropyVector;\n	#ifdef USE_ANISOTROPYMAP\n		uniform sampler2D anisotropyMap;\n	#endif\n#endif\nvarying vec3 vViewPosition;\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <iridescence_fragment>\n#include <cube_uv_reflection_fragment>\n#include <envmap_common_pars_fragment>\n#include <envmap_physical_pars_fragment>\n#include <fog_pars_fragment>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_physical_pars_fragment>\n#include <transmission_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <clearcoat_pars_fragment>\n#include <iridescence_pars_fragment>\n#include <roughnessmap_pars_fragment>\n#include <metalnessmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <roughnessmap_fragment>\n	#include <metalnessmap_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <clearcoat_normal_fragment_begin>\n	#include <clearcoat_normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_physical_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;\n	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;\n	#include <transmission_fragment>\n	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\n	#ifdef USE_SHEEN\n \n		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;\n \n 	#endif\n	#ifdef USE_CLEARCOAT\n		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );\n		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );\n		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;\n	#endif\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$4 = "#define TOON\nvarying vec3 vViewPosition;\n#include <common>\n#include <batching_pars_vertex>\n#include <uv_pars_vertex>\n#include <displacementmap_pars_vertex>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <normal_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <shadowmap_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <normal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <displacementmap_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	vViewPosition = - mvPosition.xyz;\n	#include <worldpos_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$4 = "#define TOON\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform float opacity;\n#include <common>\n#include <dithering_pars_fragment>\n#include <color_pars_fragment>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <aomap_pars_fragment>\n#include <lightmap_pars_fragment>\n#include <emissivemap_pars_fragment>\n#include <gradientmap_pars_fragment>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <normal_pars_fragment>\n#include <lights_toon_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <bumpmap_pars_fragment>\n#include <normalmap_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );\n	vec3 totalEmissiveRadiance = emissive;\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <color_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	#include <normal_fragment_begin>\n	#include <normal_fragment_maps>\n	#include <emissivemap_fragment>\n	#include <lights_toon_fragment>\n	#include <lights_fragment_begin>\n	#include <lights_fragment_maps>\n	#include <lights_fragment_end>\n	#include <aomap_fragment>\n	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n	#include <dithering_fragment>\n}";
var vertex$3 = "uniform float size;\nuniform float scale;\n#include <common>\n#include <color_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\n#ifdef USE_POINTS_UV\n	varying vec2 vUv;\n	uniform mat3 uvTransform;\n#endif\nvoid main() {\n	#ifdef USE_POINTS_UV\n		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;\n	#endif\n	#include <color_vertex>\n	#include <morphinstance_vertex>\n	#include <morphcolor_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <project_vertex>\n	gl_PointSize = size;\n	#ifdef USE_SIZEATTENUATION\n		bool isPerspective = isPerspectiveMatrix( projectionMatrix );\n		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );\n	#endif\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <worldpos_vertex>\n	#include <fog_vertex>\n}";
var fragment$3 = "uniform vec3 diffuse;\nuniform float opacity;\n#include <common>\n#include <color_pars_fragment>\n#include <map_particle_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	vec3 outgoingLight = vec3( 0.0 );\n	#include <logdepthbuf_fragment>\n	#include <map_particle_fragment>\n	#include <color_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	outgoingLight = diffuseColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n	#include <premultiplied_alpha_fragment>\n}";
var vertex$2 = "#include <common>\n#include <batching_pars_vertex>\n#include <fog_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <shadowmap_pars_vertex>\nvoid main() {\n	#include <batching_vertex>\n	#include <beginnormal_vertex>\n	#include <morphinstance_vertex>\n	#include <morphnormal_vertex>\n	#include <skinbase_vertex>\n	#include <skinnormal_vertex>\n	#include <defaultnormal_vertex>\n	#include <begin_vertex>\n	#include <morphtarget_vertex>\n	#include <skinning_vertex>\n	#include <project_vertex>\n	#include <logdepthbuf_vertex>\n	#include <worldpos_vertex>\n	#include <shadowmap_vertex>\n	#include <fog_vertex>\n}";
var fragment$2 = "uniform vec3 color;\nuniform float opacity;\n#include <common>\n#include <fog_pars_fragment>\n#include <bsdfs>\n#include <lights_pars_begin>\n#include <logdepthbuf_pars_fragment>\n#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>\nvoid main() {\n	#include <logdepthbuf_fragment>\n	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n}";
var vertex$1 = "uniform float rotation;\nuniform vec2 center;\n#include <common>\n#include <uv_pars_vertex>\n#include <fog_pars_vertex>\n#include <logdepthbuf_pars_vertex>\n#include <clipping_planes_pars_vertex>\nvoid main() {\n	#include <uv_vertex>\n	vec4 mvPosition = modelViewMatrix[ 3 ];\n	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );\n	#ifndef USE_SIZEATTENUATION\n		bool isPerspective = isPerspectiveMatrix( projectionMatrix );\n		if ( isPerspective ) scale *= - mvPosition.z;\n	#endif\n	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;\n	vec2 rotatedPosition;\n	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;\n	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;\n	mvPosition.xy += rotatedPosition;\n	gl_Position = projectionMatrix * mvPosition;\n	#include <logdepthbuf_vertex>\n	#include <clipping_planes_vertex>\n	#include <fog_vertex>\n}";
var fragment$1 = "uniform vec3 diffuse;\nuniform float opacity;\n#include <common>\n#include <uv_pars_fragment>\n#include <map_pars_fragment>\n#include <alphamap_pars_fragment>\n#include <alphatest_pars_fragment>\n#include <alphahash_pars_fragment>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n#include <clipping_planes_pars_fragment>\nvoid main() {\n	vec4 diffuseColor = vec4( diffuse, opacity );\n	#include <clipping_planes_fragment>\n	vec3 outgoingLight = vec3( 0.0 );\n	#include <logdepthbuf_fragment>\n	#include <map_fragment>\n	#include <alphamap_fragment>\n	#include <alphatest_fragment>\n	#include <alphahash_fragment>\n	outgoingLight = diffuseColor.rgb;\n	#include <opaque_fragment>\n	#include <tonemapping_fragment>\n	#include <colorspace_fragment>\n	#include <fog_fragment>\n}";
var ShaderChunk = {
  alphahash_fragment,
  alphahash_pars_fragment,
  alphamap_fragment,
  alphamap_pars_fragment,
  alphatest_fragment,
  alphatest_pars_fragment,
  aomap_fragment,
  aomap_pars_fragment,
  batching_pars_vertex,
  batching_vertex,
  begin_vertex,
  beginnormal_vertex,
  bsdfs,
  iridescence_fragment,
  bumpmap_pars_fragment,
  clipping_planes_fragment,
  clipping_planes_pars_fragment,
  clipping_planes_pars_vertex,
  clipping_planes_vertex,
  color_fragment,
  color_pars_fragment,
  color_pars_vertex,
  color_vertex,
  common,
  cube_uv_reflection_fragment,
  defaultnormal_vertex,
  displacementmap_pars_vertex,
  displacementmap_vertex,
  emissivemap_fragment,
  emissivemap_pars_fragment,
  colorspace_fragment,
  colorspace_pars_fragment,
  envmap_fragment,
  envmap_common_pars_fragment,
  envmap_pars_fragment,
  envmap_pars_vertex,
  envmap_physical_pars_fragment,
  envmap_vertex,
  fog_vertex,
  fog_pars_vertex,
  fog_fragment,
  fog_pars_fragment,
  gradientmap_pars_fragment,
  lightmap_pars_fragment,
  lights_lambert_fragment,
  lights_lambert_pars_fragment,
  lights_pars_begin,
  lights_toon_fragment,
  lights_toon_pars_fragment,
  lights_phong_fragment,
  lights_phong_pars_fragment,
  lights_physical_fragment,
  lights_physical_pars_fragment,
  lights_fragment_begin,
  lights_fragment_maps,
  lights_fragment_end,
  logdepthbuf_fragment,
  logdepthbuf_pars_fragment,
  logdepthbuf_pars_vertex,
  logdepthbuf_vertex,
  map_fragment,
  map_pars_fragment,
  map_particle_fragment,
  map_particle_pars_fragment,
  metalnessmap_fragment,
  metalnessmap_pars_fragment,
  morphinstance_vertex,
  morphcolor_vertex,
  morphnormal_vertex,
  morphtarget_pars_vertex,
  morphtarget_vertex,
  normal_fragment_begin,
  normal_fragment_maps,
  normal_pars_fragment,
  normal_pars_vertex,
  normal_vertex,
  normalmap_pars_fragment,
  clearcoat_normal_fragment_begin,
  clearcoat_normal_fragment_maps,
  clearcoat_pars_fragment,
  iridescence_pars_fragment,
  opaque_fragment,
  packing,
  premultiplied_alpha_fragment,
  project_vertex,
  dithering_fragment,
  dithering_pars_fragment,
  roughnessmap_fragment,
  roughnessmap_pars_fragment,
  shadowmap_pars_fragment,
  shadowmap_pars_vertex,
  shadowmap_vertex,
  shadowmask_pars_fragment,
  skinbase_vertex,
  skinning_pars_vertex,
  skinning_vertex,
  skinnormal_vertex,
  specularmap_fragment,
  specularmap_pars_fragment,
  tonemapping_fragment,
  tonemapping_pars_fragment,
  transmission_fragment,
  transmission_pars_fragment,
  uv_pars_fragment,
  uv_pars_vertex,
  uv_vertex,
  worldpos_vertex,
  background_vert: vertex$h,
  background_frag: fragment$h,
  backgroundCube_vert: vertex$g,
  backgroundCube_frag: fragment$g,
  cube_vert: vertex$f,
  cube_frag: fragment$f,
  depth_vert: vertex$e,
  depth_frag: fragment$e,
  distance_vert: vertex$d,
  distance_frag: fragment$d,
  equirect_vert: vertex$c,
  equirect_frag: fragment$c,
  linedashed_vert: vertex$b,
  linedashed_frag: fragment$b,
  meshbasic_vert: vertex$a,
  meshbasic_frag: fragment$a,
  meshlambert_vert: vertex$9,
  meshlambert_frag: fragment$9,
  meshmatcap_vert: vertex$8,
  meshmatcap_frag: fragment$8,
  meshnormal_vert: vertex$7,
  meshnormal_frag: fragment$7,
  meshphong_vert: vertex$6,
  meshphong_frag: fragment$6,
  meshphysical_vert: vertex$5,
  meshphysical_frag: fragment$5,
  meshtoon_vert: vertex$4,
  meshtoon_frag: fragment$4,
  points_vert: vertex$3,
  points_frag: fragment$3,
  shadow_vert: vertex$2,
  shadow_frag: fragment$2,
  sprite_vert: vertex$1,
  sprite_frag: fragment$1
};
var UniformsLib = {
  common: {
    diffuse: { value: /* @__PURE__ */ new Color(16777215) },
    opacity: { value: 1 },
    map: { value: null },
    mapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaMap: { value: null },
    alphaMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaTest: { value: 0 }
  },
  specularmap: {
    specularMap: { value: null },
    specularMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  envmap: {
    envMap: { value: null },
    envMapRotation: { value: /* @__PURE__ */ new Matrix3() },
    flipEnvMap: { value: -1 },
    reflectivity: { value: 1 },
    // basic, lambert, phong
    ior: { value: 1.5 },
    // physical
    refractionRatio: { value: 0.98 },
    // basic, lambert, phong
    dfgLUT: { value: null }
    // DFG LUT for physically-based rendering
  },
  aomap: {
    aoMap: { value: null },
    aoMapIntensity: { value: 1 },
    aoMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  lightmap: {
    lightMap: { value: null },
    lightMapIntensity: { value: 1 },
    lightMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  bumpmap: {
    bumpMap: { value: null },
    bumpMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    bumpScale: { value: 1 }
  },
  normalmap: {
    normalMap: { value: null },
    normalMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    normalScale: { value: /* @__PURE__ */ new Vector2(1, 1) }
  },
  displacementmap: {
    displacementMap: { value: null },
    displacementMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    displacementScale: { value: 1 },
    displacementBias: { value: 0 }
  },
  emissivemap: {
    emissiveMap: { value: null },
    emissiveMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  metalnessmap: {
    metalnessMap: { value: null },
    metalnessMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  roughnessmap: {
    roughnessMap: { value: null },
    roughnessMapTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  gradientmap: {
    gradientMap: { value: null }
  },
  fog: {
    fogDensity: { value: 25e-5 },
    fogNear: { value: 1 },
    fogFar: { value: 2e3 },
    fogColor: { value: /* @__PURE__ */ new Color(16777215) }
  },
  lights: {
    ambientLightColor: { value: [] },
    lightProbe: { value: [] },
    directionalLights: { value: [], properties: {
      direction: {},
      color: {}
    } },
    directionalLightShadows: { value: [], properties: {
      shadowIntensity: 1,
      shadowBias: {},
      shadowNormalBias: {},
      shadowRadius: {},
      shadowMapSize: {}
    } },
    directionalShadowMap: { value: [] },
    directionalShadowMatrix: { value: [] },
    spotLights: { value: [], properties: {
      color: {},
      position: {},
      direction: {},
      distance: {},
      coneCos: {},
      penumbraCos: {},
      decay: {}
    } },
    spotLightShadows: { value: [], properties: {
      shadowIntensity: 1,
      shadowBias: {},
      shadowNormalBias: {},
      shadowRadius: {},
      shadowMapSize: {}
    } },
    spotLightMap: { value: [] },
    spotShadowMap: { value: [] },
    spotLightMatrix: { value: [] },
    pointLights: { value: [], properties: {
      color: {},
      position: {},
      decay: {},
      distance: {}
    } },
    pointLightShadows: { value: [], properties: {
      shadowIntensity: 1,
      shadowBias: {},
      shadowNormalBias: {},
      shadowRadius: {},
      shadowMapSize: {},
      shadowCameraNear: {},
      shadowCameraFar: {}
    } },
    pointShadowMap: { value: [] },
    pointShadowMatrix: { value: [] },
    hemisphereLights: { value: [], properties: {
      direction: {},
      skyColor: {},
      groundColor: {}
    } },
    // TODO (abelnation): RectAreaLight BRDF data needs to be moved from example to main src
    rectAreaLights: { value: [], properties: {
      color: {},
      position: {},
      width: {},
      height: {}
    } },
    ltc_1: { value: null },
    ltc_2: { value: null }
  },
  points: {
    diffuse: { value: /* @__PURE__ */ new Color(16777215) },
    opacity: { value: 1 },
    size: { value: 1 },
    scale: { value: 1 },
    map: { value: null },
    alphaMap: { value: null },
    alphaMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaTest: { value: 0 },
    uvTransform: { value: /* @__PURE__ */ new Matrix3() }
  },
  sprite: {
    diffuse: { value: /* @__PURE__ */ new Color(16777215) },
    opacity: { value: 1 },
    center: { value: /* @__PURE__ */ new Vector2(0.5, 0.5) },
    rotation: { value: 0 },
    map: { value: null },
    mapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaMap: { value: null },
    alphaMapTransform: { value: /* @__PURE__ */ new Matrix3() },
    alphaTest: { value: 0 }
  }
};
var ShaderLib = {
  basic: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.specularmap,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.fog
    ]),
    vertexShader: ShaderChunk.meshbasic_vert,
    fragmentShader: ShaderChunk.meshbasic_frag
  },
  lambert: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.specularmap,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) }
      }
    ]),
    vertexShader: ShaderChunk.meshlambert_vert,
    fragmentShader: ShaderChunk.meshlambert_frag
  },
  phong: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.specularmap,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) },
        specular: { value: /* @__PURE__ */ new Color(1118481) },
        shininess: { value: 30 }
      }
    ]),
    vertexShader: ShaderChunk.meshphong_vert,
    fragmentShader: ShaderChunk.meshphong_frag
  },
  standard: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.envmap,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.roughnessmap,
      UniformsLib.metalnessmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) },
        roughness: { value: 1 },
        metalness: { value: 0 },
        envMapIntensity: { value: 1 }
      }
    ]),
    vertexShader: ShaderChunk.meshphysical_vert,
    fragmentShader: ShaderChunk.meshphysical_frag
  },
  toon: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.aomap,
      UniformsLib.lightmap,
      UniformsLib.emissivemap,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.gradientmap,
      UniformsLib.fog,
      UniformsLib.lights,
      {
        emissive: { value: /* @__PURE__ */ new Color(0) }
      }
    ]),
    vertexShader: ShaderChunk.meshtoon_vert,
    fragmentShader: ShaderChunk.meshtoon_frag
  },
  matcap: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      UniformsLib.fog,
      {
        matcap: { value: null }
      }
    ]),
    vertexShader: ShaderChunk.meshmatcap_vert,
    fragmentShader: ShaderChunk.meshmatcap_frag
  },
  points: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.points,
      UniformsLib.fog
    ]),
    vertexShader: ShaderChunk.points_vert,
    fragmentShader: ShaderChunk.points_frag
  },
  dashed: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.fog,
      {
        scale: { value: 1 },
        dashSize: { value: 1 },
        totalSize: { value: 2 }
      }
    ]),
    vertexShader: ShaderChunk.linedashed_vert,
    fragmentShader: ShaderChunk.linedashed_frag
  },
  depth: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.displacementmap
    ]),
    vertexShader: ShaderChunk.depth_vert,
    fragmentShader: ShaderChunk.depth_frag
  },
  normal: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.bumpmap,
      UniformsLib.normalmap,
      UniformsLib.displacementmap,
      {
        opacity: { value: 1 }
      }
    ]),
    vertexShader: ShaderChunk.meshnormal_vert,
    fragmentShader: ShaderChunk.meshnormal_frag
  },
  sprite: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.sprite,
      UniformsLib.fog
    ]),
    vertexShader: ShaderChunk.sprite_vert,
    fragmentShader: ShaderChunk.sprite_frag
  },
  background: {
    uniforms: {
      uvTransform: { value: /* @__PURE__ */ new Matrix3() },
      t2D: { value: null },
      backgroundIntensity: { value: 1 }
    },
    vertexShader: ShaderChunk.background_vert,
    fragmentShader: ShaderChunk.background_frag
  },
  backgroundCube: {
    uniforms: {
      envMap: { value: null },
      flipEnvMap: { value: -1 },
      backgroundBlurriness: { value: 0 },
      backgroundIntensity: { value: 1 },
      backgroundRotation: { value: /* @__PURE__ */ new Matrix3() }
    },
    vertexShader: ShaderChunk.backgroundCube_vert,
    fragmentShader: ShaderChunk.backgroundCube_frag
  },
  cube: {
    uniforms: {
      tCube: { value: null },
      tFlip: { value: -1 },
      opacity: { value: 1 }
    },
    vertexShader: ShaderChunk.cube_vert,
    fragmentShader: ShaderChunk.cube_frag
  },
  equirect: {
    uniforms: {
      tEquirect: { value: null }
    },
    vertexShader: ShaderChunk.equirect_vert,
    fragmentShader: ShaderChunk.equirect_frag
  },
  distance: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.common,
      UniformsLib.displacementmap,
      {
        referencePosition: { value: /* @__PURE__ */ new Vector3() },
        nearDistance: { value: 1 },
        farDistance: { value: 1e3 }
      }
    ]),
    vertexShader: ShaderChunk.distance_vert,
    fragmentShader: ShaderChunk.distance_frag
  },
  shadow: {
    uniforms: /* @__PURE__ */ mergeUniforms([
      UniformsLib.lights,
      UniformsLib.fog,
      {
        color: { value: /* @__PURE__ */ new Color(0) },
        opacity: { value: 1 }
      }
    ]),
    vertexShader: ShaderChunk.shadow_vert,
    fragmentShader: ShaderChunk.shadow_frag
  }
};
ShaderLib.physical = {
  uniforms: /* @__PURE__ */ mergeUniforms([
    ShaderLib.standard.uniforms,
    {
      clearcoat: { value: 0 },
      clearcoatMap: { value: null },
      clearcoatMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      clearcoatNormalMap: { value: null },
      clearcoatNormalMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      clearcoatNormalScale: { value: /* @__PURE__ */ new Vector2(1, 1) },
      clearcoatRoughness: { value: 0 },
      clearcoatRoughnessMap: { value: null },
      clearcoatRoughnessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      dispersion: { value: 0 },
      iridescence: { value: 0 },
      iridescenceMap: { value: null },
      iridescenceMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      iridescenceIOR: { value: 1.3 },
      iridescenceThicknessMinimum: { value: 100 },
      iridescenceThicknessMaximum: { value: 400 },
      iridescenceThicknessMap: { value: null },
      iridescenceThicknessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      sheen: { value: 0 },
      sheenColor: { value: /* @__PURE__ */ new Color(0) },
      sheenColorMap: { value: null },
      sheenColorMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      sheenRoughness: { value: 1 },
      sheenRoughnessMap: { value: null },
      sheenRoughnessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      transmission: { value: 0 },
      transmissionMap: { value: null },
      transmissionMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      transmissionSamplerSize: { value: /* @__PURE__ */ new Vector2() },
      transmissionSamplerMap: { value: null },
      thickness: { value: 0 },
      thicknessMap: { value: null },
      thicknessMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      attenuationDistance: { value: 0 },
      attenuationColor: { value: /* @__PURE__ */ new Color(0) },
      specularColor: { value: /* @__PURE__ */ new Color(1, 1, 1) },
      specularColorMap: { value: null },
      specularColorMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      specularIntensity: { value: 1 },
      specularIntensityMap: { value: null },
      specularIntensityMapTransform: { value: /* @__PURE__ */ new Matrix3() },
      anisotropyVector: { value: /* @__PURE__ */ new Vector2() },
      anisotropyMap: { value: null },
      anisotropyMapTransform: { value: /* @__PURE__ */ new Matrix3() }
    }
  ]),
  vertexShader: ShaderChunk.meshphysical_vert,
  fragmentShader: ShaderChunk.meshphysical_frag
};
var toneMappingMap = {
  [LinearToneMapping]: "LINEAR_TONE_MAPPING",
  [ReinhardToneMapping]: "REINHARD_TONE_MAPPING",
  [CineonToneMapping]: "CINEON_TONE_MAPPING",
  [ACESFilmicToneMapping]: "ACES_FILMIC_TONE_MAPPING",
  [AgXToneMapping]: "AGX_TONE_MAPPING",
  [NeutralToneMapping]: "NEUTRAL_TONE_MAPPING",
  [CustomToneMapping]: "CUSTOM_TONE_MAPPING"
};
var mat4array = new Float32Array(16);
var mat3array = new Float32Array(9);
var mat2array = new Float32Array(4);
var toneMappingFunctions = {
  [LinearToneMapping]: "Linear",
  [ReinhardToneMapping]: "Reinhard",
  [CineonToneMapping]: "Cineon",
  [ACESFilmicToneMapping]: "ACESFilmic",
  [AgXToneMapping]: "AgX",
  [NeutralToneMapping]: "Neutral",
  [CustomToneMapping]: "Custom"
};
var shadowMapTypeDefines = {
  [PCFShadowMap]: "SHADOWMAP_TYPE_PCF",
  [VSMShadowMap]: "SHADOWMAP_TYPE_VSM"
};
var envMapTypeDefines = {
  [CubeReflectionMapping]: "ENVMAP_TYPE_CUBE",
  [CubeRefractionMapping]: "ENVMAP_TYPE_CUBE",
  [CubeUVReflectionMapping]: "ENVMAP_TYPE_CUBE_UV"
};
var envMapModeDefines = {
  [CubeRefractionMapping]: "ENVMAP_MODE_REFRACTION"
};
var envMapBlendingDefines = {
  [MultiplyOperation]: "ENVMAP_BLENDING_MULTIPLY",
  [MixOperation]: "ENVMAP_BLENDING_MIX",
  [AddOperation]: "ENVMAP_BLENDING_ADD"
};
var reversedFuncs = {
  [NeverDepth]: AlwaysDepth,
  [LessDepth]: GreaterDepth,
  [EqualDepth]: NotEqualDepth,
  [LessEqualDepth]: GreaterEqualDepth,
  [AlwaysDepth]: NeverDepth,
  [GreaterDepth]: LessDepth,
  [NotEqualDepth]: EqualDepth,
  [GreaterEqualDepth]: LessEqualDepth
};
var DATA = new Uint16Array([
  12469,
  15057,
  12620,
  14925,
  13266,
  14620,
  13807,
  14376,
  14323,
  13990,
  14545,
  13625,
  14713,
  13328,
  14840,
  12882,
  14931,
  12528,
  14996,
  12233,
  15039,
  11829,
  15066,
  11525,
  15080,
  11295,
  15085,
  10976,
  15082,
  10705,
  15073,
  10495,
  13880,
  14564,
  13898,
  14542,
  13977,
  14430,
  14158,
  14124,
  14393,
  13732,
  14556,
  13410,
  14702,
  12996,
  14814,
  12596,
  14891,
  12291,
  14937,
  11834,
  14957,
  11489,
  14958,
  11194,
  14943,
  10803,
  14921,
  10506,
  14893,
  10278,
  14858,
  9960,
  14484,
  14039,
  14487,
  14025,
  14499,
  13941,
  14524,
  13740,
  14574,
  13468,
  14654,
  13106,
  14743,
  12678,
  14818,
  12344,
  14867,
  11893,
  14889,
  11509,
  14893,
  11180,
  14881,
  10751,
  14852,
  10428,
  14812,
  10128,
  14765,
  9754,
  14712,
  9466,
  14764,
  13480,
  14764,
  13475,
  14766,
  13440,
  14766,
  13347,
  14769,
  13070,
  14786,
  12713,
  14816,
  12387,
  14844,
  11957,
  14860,
  11549,
  14868,
  11215,
  14855,
  10751,
  14825,
  10403,
  14782,
  10044,
  14729,
  9651,
  14666,
  9352,
  14599,
  9029,
  14967,
  12835,
  14966,
  12831,
  14963,
  12804,
  14954,
  12723,
  14936,
  12564,
  14917,
  12347,
  14900,
  11958,
  14886,
  11569,
  14878,
  11247,
  14859,
  10765,
  14828,
  10401,
  14784,
  10011,
  14727,
  9600,
  14660,
  9289,
  14586,
  8893,
  14508,
  8533,
  15111,
  12234,
  15110,
  12234,
  15104,
  12216,
  15092,
  12156,
  15067,
  12010,
  15028,
  11776,
  14981,
  11500,
  14942,
  11205,
  14902,
  10752,
  14861,
  10393,
  14812,
  9991,
  14752,
  9570,
  14682,
  9252,
  14603,
  8808,
  14519,
  8445,
  14431,
  8145,
  15209,
  11449,
  15208,
  11451,
  15202,
  11451,
  15190,
  11438,
  15163,
  11384,
  15117,
  11274,
  15055,
  10979,
  14994,
  10648,
  14932,
  10343,
  14871,
  9936,
  14803,
  9532,
  14729,
  9218,
  14645,
  8742,
  14556,
  8381,
  14461,
  8020,
  14365,
  7603,
  15273,
  10603,
  15272,
  10607,
  15267,
  10619,
  15256,
  10631,
  15231,
  10614,
  15182,
  10535,
  15118,
  10389,
  15042,
  10167,
  14963,
  9787,
  14883,
  9447,
  14800,
  9115,
  14710,
  8665,
  14615,
  8318,
  14514,
  7911,
  14411,
  7507,
  14279,
  7198,
  15314,
  9675,
  15313,
  9683,
  15309,
  9712,
  15298,
  9759,
  15277,
  9797,
  15229,
  9773,
  15166,
  9668,
  15084,
  9487,
  14995,
  9274,
  14898,
  8910,
  14800,
  8539,
  14697,
  8234,
  14590,
  7790,
  14479,
  7409,
  14367,
  7067,
  14178,
  6621,
  15337,
  8619,
  15337,
  8631,
  15333,
  8677,
  15325,
  8769,
  15305,
  8871,
  15264,
  8940,
  15202,
  8909,
  15119,
  8775,
  15022,
  8565,
  14916,
  8328,
  14804,
  8009,
  14688,
  7614,
  14569,
  7287,
  14448,
  6888,
  14321,
  6483,
  14088,
  6171,
  15350,
  7402,
  15350,
  7419,
  15347,
  7480,
  15340,
  7613,
  15322,
  7804,
  15287,
  7973,
  15229,
  8057,
  15148,
  8012,
  15046,
  7846,
  14933,
  7611,
  14810,
  7357,
  14682,
  7069,
  14552,
  6656,
  14421,
  6316,
  14251,
  5948,
  14007,
  5528,
  15356,
  5942,
  15356,
  5977,
  15353,
  6119,
  15348,
  6294,
  15332,
  6551,
  15302,
  6824,
  15249,
  7044,
  15171,
  7122,
  15070,
  7050,
  14949,
  6861,
  14818,
  6611,
  14679,
  6349,
  14538,
  6067,
  14398,
  5651,
  14189,
  5311,
  13935,
  4958,
  15359,
  4123,
  15359,
  4153,
  15356,
  4296,
  15353,
  4646,
  15338,
  5160,
  15311,
  5508,
  15263,
  5829,
  15188,
  6042,
  15088,
  6094,
  14966,
  6001,
  14826,
  5796,
  14678,
  5543,
  14527,
  5287,
  14377,
  4985,
  14133,
  4586,
  13869,
  4257,
  15360,
  1563,
  15360,
  1642,
  15358,
  2076,
  15354,
  2636,
  15341,
  3350,
  15317,
  4019,
  15273,
  4429,
  15203,
  4732,
  15105,
  4911,
  14981,
  4932,
  14836,
  4818,
  14679,
  4621,
  14517,
  4386,
  14359,
  4156,
  14083,
  3795,
  13808,
  3437,
  15360,
  122,
  15360,
  137,
  15358,
  285,
  15355,
  636,
  15344,
  1274,
  15322,
  2177,
  15281,
  2765,
  15215,
  3223,
  15120,
  3451,
  14995,
  3569,
  14846,
  3567,
  14681,
  3466,
  14511,
  3305,
  14344,
  3121,
  14037,
  2800,
  13753,
  2467,
  15360,
  0,
  15360,
  1,
  15359,
  21,
  15355,
  89,
  15346,
  253,
  15325,
  479,
  15287,
  796,
  15225,
  1148,
  15133,
  1492,
  15008,
  1749,
  14856,
  1882,
  14685,
  1886,
  14506,
  1783,
  14324,
  1608,
  13996,
  1398,
  13702,
  1183
]);

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/sim/moonEphemeris.ts
var AU_KM = 1495978707e-1;
var DEG_TO_RAD = Math.PI / 180;
var TWO_PI = Math.PI * 2;
var VELOCITY_DIFFERENCE_STEP_DAYS = 1e-4;
var MOON_EPHEMERIS_FEATURE_COUNT = 9;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireFiniteNumber(record, field, context) {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}.${field} must be a finite number`);
  }
  return value;
}
function parseMoonEphemerisArtifact(value) {
  if (!isRecord(value)) throw new Error("moon ephemeris artifact must be an object");
  if (value.schemaVersion !== 1) throw new Error("unsupported moon ephemeris schemaVersion");
  if (value.kind !== "horizons-chebyshev-elements-v1") {
    throw new Error("unsupported moon ephemeris artifact kind");
  }
  if (value.coverageTimeScale !== "TDB") {
    throw new Error("moon ephemeris coverageTimeScale must be TDB");
  }
  if (typeof value.referenceFrame !== "string" || !value.referenceFrame.includes("J2000")) {
    throw new Error("moon ephemeris referenceFrame must identify J2000");
  }
  const expectedFeatures = [
    "aKm",
    "hx",
    "hy",
    "hz",
    "ex",
    "ey",
    "ez",
    "meanLongitudeResidualDeg",
    "meanMotionDegPerDay"
  ];
  if (!Array.isArray(value.featureOrder) || value.featureOrder.length !== expectedFeatures.length || value.featureOrder.some((feature, index) => feature !== expectedFeatures[index])) {
    throw new Error("moon ephemeris featureOrder does not match the runtime schema");
  }
  if (!isRecord(value.bodies) || Object.keys(value.bodies).length === 0) {
    throw new Error("moon ephemeris artifact contains no bodies");
  }
  for (const [bodyId, untypedBody] of Object.entries(value.bodies)) {
    const context = `moon ephemeris body ${bodyId}`;
    if (bodyId !== bodyId.toLowerCase() || !isRecord(untypedBody)) {
      throw new Error(`${context} must be keyed by a lower-case id and contain an object`);
    }
    if (untypedBody.kind !== value.kind) throw new Error(`${context}.kind is inconsistent`);
    const coverageStartJd = requireFiniteNumber(untypedBody, "coverageStartJd", context);
    const coverageEndJd = requireFiniteNumber(untypedBody, "coverageEndJd", context);
    const sourceStepDays = requireFiniteNumber(untypedBody, "sourceStepDays", context);
    requireFiniteNumber(untypedBody, "meanLongitudeBaseDeg", context);
    requireFiniteNumber(untypedBody, "meanLongitudeRateDegPerDay", context);
    if (!(coverageEndJd > coverageStartJd) || !(sourceStepDays > 0)) {
      throw new Error(`${context} has invalid coverage or source spacing`);
    }
    if (!isRecord(untypedBody.provenance)) throw new Error(`${context}.provenance is missing`);
    const provenance = untypedBody.provenance;
    for (const field of ["source", "sourceEphemeris", "targetId", "centerId", "generatedAt", "generator", "query"]) {
      if (typeof provenance[field] !== "string" || provenance[field].length === 0) {
        throw new Error(`${context}.provenance.${field} must be a non-empty string`);
      }
    }
    if (provenance.frame !== "ECLIPJ2000" || provenance.timeScale !== "TDB") {
      throw new Error(`${context} has an incompatible frame or time scale`);
    }
    for (const hashField of ["sourceRowsSha256", "heldOutRowsSha256"]) {
      if (typeof untypedBody[hashField] !== "string" || !/^[0-9a-f]{64}$/.test(untypedBody[hashField])) {
        throw new Error(`${context}.${hashField} must be a SHA-256 digest`);
      }
    }
    if (!isRecord(untypedBody.validation)) throw new Error(`${context}.validation is missing`);
    const validation = untypedBody.validation;
    const sampleCount = requireFiniteNumber(validation, "sampleCount", `${context}.validation`);
    const heldOutSampleCount = requireFiniteNumber(
      validation,
      "heldOutSampleCount",
      `${context}.validation`
    );
    const endpointSampleCount = requireFiniteNumber(
      validation,
      "coverageEndpointSampleCount",
      `${context}.validation`
    );
    if (!Number.isInteger(sampleCount) || !Number.isInteger(heldOutSampleCount) || endpointSampleCount !== 2 || sampleCount !== heldOutSampleCount + endpointSampleCount) {
      throw new Error(`${context}.validation sample counts are inconsistent`);
    }
    if (!Array.isArray(validation.coverageEndpointErrors) || validation.coverageEndpointErrors.length !== endpointSampleCount) {
      throw new Error(`${context}.validation must include both coverage endpoints`);
    }
    const endpointJds = [];
    for (const [endpointIndex, untypedEndpoint] of validation.coverageEndpointErrors.entries()) {
      const endpointContext = `${context}.validation.coverageEndpointErrors[${endpointIndex}]`;
      if (!isRecord(untypedEndpoint)) throw new Error(`${endpointContext} must be an object`);
      endpointJds.push(requireFiniteNumber(untypedEndpoint, "jdTdb", endpointContext));
      requireFiniteNumber(untypedEndpoint, "positionErrorKm", endpointContext);
      requireFiniteNumber(untypedEndpoint, "velocityErrorMPerS", endpointContext);
    }
    endpointJds.sort((left, right) => left - right);
    if (Math.abs(endpointJds[0] - coverageStartJd) > 1e-9 || Math.abs(endpointJds[1] - coverageEndJd) > 1e-9) {
      throw new Error(`${context}.validation endpoints do not match declared coverage`);
    }
    if (!isRecord(validation.accuracyLimits)) {
      throw new Error(`${context}.validation.accuracyLimits is missing`);
    }
    const positionLimit = requireFiniteNumber(
      validation.accuracyLimits,
      "positionKm",
      `${context}.validation.accuracyLimits`
    );
    const velocityLimit = requireFiniteNumber(
      validation.accuracyLimits,
      "velocityMPerS",
      `${context}.validation.accuracyLimits`
    );
    const maximumByStatsField = {};
    for (const statsField of ["positionErrorKm", "velocityErrorMPerS"]) {
      const stats = validation[statsField];
      if (!isRecord(stats)) throw new Error(`${context}.validation.${statsField} is missing`);
      for (const percentile of ["p50", "p95", "p99", "max"]) {
        const statistic = requireFiniteNumber(
          stats,
          percentile,
          `${context}.validation.${statsField}`
        );
        if (percentile === "max") maximumByStatsField[statsField] = statistic;
      }
    }
    if (maximumByStatsField.positionErrorKm > positionLimit || maximumByStatsField.velocityErrorMPerS > velocityLimit) {
      throw new Error(`${context}.validation exceeds its declared accuracy limit`);
    }
    if (!isRecord(validation.boundaryContinuity) || validation.boundaryContinuity.runtimeStateContinuous !== true) {
      throw new Error(`${context}.validation does not certify runtime state continuity`);
    }
    if (!Array.isArray(untypedBody.segments) || untypedBody.segments.length === 0) {
      throw new Error(`${context}.segments must be non-empty`);
    }
    let expectedStart = coverageStartJd;
    for (let segmentIndex = 0; segmentIndex < untypedBody.segments.length; segmentIndex += 1) {
      const untypedSegment = untypedBody.segments[segmentIndex];
      const segmentContext = `${context}.segments[${segmentIndex}]`;
      if (!isRecord(untypedSegment)) throw new Error(`${segmentContext} must be an object`);
      const startJd = requireFiniteNumber(untypedSegment, "startJd", segmentContext);
      const endJd = requireFiniteNumber(untypedSegment, "endJd", segmentContext);
      if (Math.abs(startJd - expectedStart) > 1e-9 || !(endJd > startJd)) {
        throw new Error(`${segmentContext} is non-contiguous or has a non-positive span`);
      }
      expectedStart = endJd;
      if (!Array.isArray(untypedSegment.coefficients) || untypedSegment.coefficients.length !== MOON_EPHEMERIS_FEATURE_COUNT) {
        throw new Error(`${segmentContext} must contain ${MOON_EPHEMERIS_FEATURE_COUNT} coefficient series`);
      }
      for (const [featureIndex, coefficients] of untypedSegment.coefficients.entries()) {
        if (!Array.isArray(coefficients) || coefficients.length === 0 || coefficients.some((coefficient) => typeof coefficient !== "number" || !Number.isFinite(coefficient))) {
          throw new Error(`${segmentContext}.coefficients[${featureIndex}] is invalid`);
        }
      }
    }
    if (Math.abs(expectedStart - coverageEndJd) > 1e-9) {
      throw new Error(`${context}.segments do not cover the declared end date`);
    }
  }
  return value;
}
function clamp2(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function normalizeRadians(value) {
  const reduced = value % TWO_PI;
  return reduced < 0 ? reduced + TWO_PI : reduced;
}
function evaluateChebyshev(coefficients, x) {
  let bKPlusOne = 0;
  let bKPlusTwo = 0;
  for (let k = coefficients.length - 1; k >= 1; k -= 1) {
    const bK = 2 * x * bKPlusOne - bKPlusTwo + coefficients[k];
    bKPlusTwo = bKPlusOne;
    bKPlusOne = bK;
  }
  return (coefficients[0] ?? 0) + x * bKPlusOne - bKPlusTwo;
}
function moonEphemerisCoverageAt(ephemeris, jd) {
  if (jd < ephemeris.coverageStartJd) return "before-coverage";
  if (jd > ephemeris.coverageEndJd) return "after-coverage";
  return "covered";
}
function segmentIndexAt(ephemeris, jd) {
  if (moonEphemerisCoverageAt(ephemeris, jd) !== "covered") return -1;
  let low = 0;
  let high = ephemeris.segments.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (ephemeris.segments[middle].startJd <= jd) low = middle + 1;
    else high = middle;
  }
  const index = Math.min(Math.max(low - 1, 0), ephemeris.segments.length - 1);
  const segment = ephemeris.segments[index];
  return segment && jd >= segment.startJd && jd <= segment.endJd ? index : -1;
}
function evaluateSegmentFeatures(segment, jd) {
  if (segment.coefficients.length !== MOON_EPHEMERIS_FEATURE_COUNT) return null;
  const halfSpan = (segment.endJd - segment.startJd) / 2;
  if (!(halfSpan > 0)) return null;
  const midpoint = (segment.startJd + segment.endJd) / 2;
  const x = (jd - midpoint) / halfSpan;
  const values = segment.coefficients.map((series) => evaluateChebyshev(series, x));
  return values.every(Number.isFinite) ? values : null;
}
function smoothStep(value) {
  const unit = clamp2(value, 0, 1);
  return unit * unit * (3 - 2 * unit);
}
function featuresAt(ephemeris, jd) {
  const index = segmentIndexAt(ephemeris, jd);
  if (index < 0) return null;
  const segment = ephemeris.segments[index];
  const base = evaluateSegmentFeatures(segment, jd);
  if (!base) return null;
  const halfBlend = Math.max(0, ephemeris.sourceStepDays / 2);
  let left = null;
  let right = null;
  let boundary = 0;
  if (halfBlend > 0 && index > 0 && jd < segment.startJd + halfBlend) {
    left = ephemeris.segments[index - 1];
    right = segment;
    boundary = segment.startJd;
  } else if (halfBlend > 0 && index + 1 < ephemeris.segments.length && jd > segment.endJd - halfBlend) {
    left = segment;
    right = ephemeris.segments[index + 1];
    boundary = segment.endJd;
  }
  if (!left || !right) return base;
  const leftValues = evaluateSegmentFeatures(left, jd);
  const rightValues = evaluateSegmentFeatures(right, jd);
  if (!leftValues || !rightValues) return null;
  const weight = smoothStep((jd - (boundary - halfBlend)) / (2 * halfBlend));
  return leftValues.map(
    (value, featureIndex) => value + (rightValues[featureIndex] - value) * weight
  );
}
function solveKepler(meanAnomalyRad, eccentricity) {
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomalyRad : Math.PI;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const sine = Math.sin(eccentricAnomaly);
    const cosine = Math.cos(eccentricAnomaly);
    const delta = (eccentricAnomaly - eccentricity * sine - meanAnomalyRad) / (1 - eccentricity * cosine);
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return eccentricAnomaly;
}
function propagateMoonEphemeris(ephemeris, jd, outPosition, outVelocity = null) {
  const feature = featuresAt(ephemeris, jd);
  if (!feature) return false;
  const aKm = feature[0];
  let hx = feature[1];
  let hy = feature[2];
  let hz = feature[3];
  const hMagnitude = Math.hypot(hx, hy, hz);
  if (!(aKm > 0) || !(hMagnitude > 1e-12)) return false;
  hx /= hMagnitude;
  hy /= hMagnitude;
  hz /= hMagnitude;
  let ex = feature[4];
  let ey = feature[5];
  let ez = feature[6];
  const parallelE = ex * hx + ey * hy + ez * hz;
  ex -= parallelE * hx;
  ey -= parallelE * hy;
  ez -= parallelE * hz;
  const eccentricity = Math.hypot(ex, ey, ez);
  if (!(eccentricity >= 0 && eccentricity < 1)) return false;
  const sinInclination = Math.hypot(hx, hy);
  const ascendingNodeRad = sinInclination > 1e-12 ? Math.atan2(hx, -hy) : 0;
  const nodeX = Math.cos(ascendingNodeRad);
  const nodeY = Math.sin(ascendingNodeRad);
  const transverseX = -hz * nodeY;
  const transverseY = hz * nodeX;
  const transverseZ = hx * nodeY - hy * nodeX;
  const px = eccentricity > 1e-12 ? ex / eccentricity : nodeX;
  const py = eccentricity > 1e-12 ? ey / eccentricity : nodeY;
  const pz = eccentricity > 1e-12 ? ez / eccentricity : 0;
  const argPeriapsisRad = eccentricity > 1e-12 ? Math.atan2(
    px * transverseX + py * transverseY + pz * transverseZ,
    px * nodeX + py * nodeY
  ) : 0;
  const qx = hy * pz - hz * py;
  const qy = hz * px - hx * pz;
  const qz = hx * py - hy * px;
  const meanLongitudeDeg = ephemeris.meanLongitudeBaseDeg + ephemeris.meanLongitudeRateDegPerDay * (jd - ephemeris.coverageStartJd) + feature[7];
  const meanAnomalyRad = normalizeRadians(
    meanLongitudeDeg * DEG_TO_RAD - ascendingNodeRad - argPeriapsisRad
  );
  const eccentricAnomaly = solveKepler(meanAnomalyRad, eccentricity);
  const cosineE = Math.cos(eccentricAnomaly);
  const sineE = Math.sin(eccentricAnomaly);
  const sqrtOneMinusESquared = Math.sqrt(1 - eccentricity * eccentricity);
  const xPerifocalKm = aKm * (cosineE - eccentricity);
  const yPerifocalKm = aKm * sqrtOneMinusESquared * sineE;
  const positionAu = [
    (xPerifocalKm * px + yPerifocalKm * qx) / AU_KM,
    (xPerifocalKm * py + yPerifocalKm * qy) / AU_KM,
    (xPerifocalKm * pz + yPerifocalKm * qz) / AU_KM
  ];
  let velocityAuPerDay = null;
  if (outVelocity) {
    const beforeJd = Math.max(ephemeris.coverageStartJd, jd - VELOCITY_DIFFERENCE_STEP_DAYS);
    const afterJd = Math.min(ephemeris.coverageEndJd, jd + VELOCITY_DIFFERENCE_STEP_DAYS);
    const before2 = { x: 0, y: 0, z: 0, set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    } };
    const after2 = { x: 0, y: 0, z: 0, set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    } };
    if (afterJd <= beforeJd || !propagateMoonEphemeris(ephemeris, beforeJd, before2, null) || !propagateMoonEphemeris(ephemeris, afterJd, after2, null)) {
      return false;
    }
    const inverseStep = 1 / (afterJd - beforeJd);
    velocityAuPerDay = [
      (after2.x - before2.x) * inverseStep,
      (after2.y - before2.y) * inverseStep,
      (after2.z - before2.z) * inverseStep
    ];
  }
  outPosition.set(...positionAu);
  if (outVelocity && velocityAuPerDay) outVelocity.set(...velocityAuPerDay);
  return true;
}

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/sim/sourceFrameOrbit.ts
var TWO_PI2 = Math.PI * 2;
var DEG_TO_RAD2 = Math.PI / 180;
var JULIAN_CENTURY_DAYS = 36525;
function isSourceFrameKeplerOrbit(orbit) {
  const candidate = orbit;
  return candidate.sourceFrameBasis !== void 0;
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function normalizeRadians2(angle) {
  const reduced = angle % TWO_PI2;
  return reduced < 0 ? reduced + TWO_PI2 : reduced;
}
function solveKepler2(meanAnomalyRad, eccentricity) {
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomalyRad : Math.PI;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const delta = (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomalyRad) / (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return eccentricAnomaly;
}
function requireFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
  return value;
}
function integratedMeanMotion(baseMeanMotionRadPerDay, baseAAu, aRateAuPerDay, elapsedDays) {
  if (aRateAuPerDay === 0 || elapsedDays === 0) {
    return baseMeanMotionRadPerDay * elapsedDays;
  }
  const relativeChange = aRateAuPerDay * elapsedDays / baseAAu;
  if (relativeChange <= -1) {
    throw new RangeError("semimajor-axis drift reaches a non-positive value");
  }
  const oneMinusInverseSqrt = -Math.expm1(-0.5 * Math.log1p(relativeChange));
  return 2 * baseMeanMotionRadPerDay * baseAAu * oneMinusInverseSqrt / aRateAuPerDay;
}
function resolveSourceFrameOrbitAtElapsedDays(orbit, elapsedDays) {
  requireFinite(elapsedDays, "elapsed days");
  const baseA = requireFinite(orbit.aAu, "semimajor axis");
  const baseE = requireFinite(orbit.e ?? 0, "eccentricity");
  const basePeriodDays = requireFinite(orbit.periodDays, "period");
  if (baseA <= 0 || basePeriodDays <= 0 || baseE < 0 || baseE >= 1) {
    throw new RangeError("source-frame orbit requires a > 0, period > 0 and 0 <= e < 1");
  }
  const rates = orbit.secularRates;
  const centuriesSinceEpoch = elapsedDays / JULIAN_CENTURY_DAYS;
  const aRateAuPerDay = (rates?.aAuPerCentury ?? 0) / JULIAN_CENTURY_DAYS;
  const eRatePerDay = (rates?.ePerCentury ?? 0) / JULIAN_CENTURY_DAYS;
  const iRateRadPerDay = (rates?.iDegPerCentury ?? 0) * DEG_TO_RAD2 / JULIAN_CENTURY_DAYS;
  const ascendingNodeRateRadPerDay = (rates?.ascendingNodeDegPerCentury ?? 0) * DEG_TO_RAD2 / JULIAN_CENTURY_DAYS;
  const argPeriapsisRateRadPerDay = (rates?.argPeriapsisDegPerCentury ?? 0) * DEG_TO_RAD2 / JULIAN_CENTURY_DAYS;
  const aAu = baseA + aRateAuPerDay * elapsedDays;
  const e = baseE + eRatePerDay * elapsedDays;
  if (aAu <= 0 || e < 0 || e >= 1) {
    throw new RangeError("secular drift produced an invalid elliptic orbit");
  }
  const iRad = (orbit.iDeg ?? 0) * DEG_TO_RAD2 + iRateRadPerDay * elapsedDays;
  const ascendingNodeRad = (orbit.ascendingNodeDeg ?? 0) * DEG_TO_RAD2 + ascendingNodeRateRadPerDay * elapsedDays;
  const argPeriapsisRad = (orbit.argPeriapsisDeg ?? 0) * DEG_TO_RAD2 + argPeriapsisRateRadPerDay * elapsedDays;
  const periodDays = basePeriodDays * Math.pow(aAu / baseA, 1.5);
  const baseMeanMotionRadPerDay = TWO_PI2 / basePeriodDays;
  const currentPeriodMotionRadPerDay = TWO_PI2 / periodDays;
  const varpiRateRadPerDay = ascendingNodeRateRadPerDay + argPeriapsisRateRadPerDay;
  const configuredMeanLongitudeRate = rates?.meanLongitudeDegPerCentury;
  let meanMotionRadPerDay;
  let meanAnomalyAdvance;
  if (configuredMeanLongitudeRate !== void 0) {
    const meanLongitudeRateRadPerDay = configuredMeanLongitudeRate * DEG_TO_RAD2 / JULIAN_CENTURY_DAYS;
    meanMotionRadPerDay = meanLongitudeRateRadPerDay - varpiRateRadPerDay;
    meanAnomalyAdvance = meanMotionRadPerDay * elapsedDays;
  } else {
    const periodAdvance = integratedMeanMotion(
      baseMeanMotionRadPerDay,
      baseA,
      aRateAuPerDay,
      elapsedDays
    );
    if (rates?.periodIsMeanLongitudePeriod) {
      meanMotionRadPerDay = currentPeriodMotionRadPerDay - varpiRateRadPerDay;
      meanAnomalyAdvance = periodAdvance - varpiRateRadPerDay * elapsedDays;
    } else {
      meanMotionRadPerDay = currentPeriodMotionRadPerDay;
      meanAnomalyAdvance = periodAdvance;
    }
  }
  return {
    aAu,
    e,
    iRad,
    ascendingNodeRad,
    argPeriapsisRad,
    meanAnomalyRad: normalizeRadians2((orbit.meanAnomalyDeg ?? 0) * DEG_TO_RAD2 + meanAnomalyAdvance),
    meanMotionRadPerDay,
    aRateAuPerDay,
    eRatePerDay,
    iRateRadPerDay,
    ascendingNodeRateRadPerDay,
    argPeriapsisRateRadPerDay,
    periodDays,
    centuriesSinceEpoch
  };
}
function rotateZ(vector, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: cosine * vector.x - sine * vector.y,
    y: sine * vector.x + cosine * vector.y,
    z: vector.z
  };
}
function rotateX(vector, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: vector.x,
    y: cosine * vector.y - sine * vector.z,
    z: sine * vector.y + cosine * vector.z
  };
}
function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(vector, scalar) {
  return { x: scalar * vector.x, y: scalar * vector.y, z: scalar * vector.z };
}
function transformByBasis(vector, basis) {
  return {
    x: basis.x.x * vector.x + basis.y.x * vector.y + basis.z.x * vector.z,
    y: basis.x.y * vector.x + basis.y.y * vector.y + basis.z.y * vector.z,
    z: basis.x.z * vector.x + basis.y.z * vector.y + basis.z.z * vector.z
  };
}
function propagateSourceFrameOrbit(orbit, elapsedDays, outPosition, outVelocity = null) {
  const resolved = resolveSourceFrameOrbitAtElapsedDays(orbit, elapsedDays);
  const eccentricAnomaly = solveKepler2(resolved.meanAnomalyRad, resolved.e);
  const cosineE = Math.cos(eccentricAnomaly);
  const sineE = Math.sin(eccentricAnomaly);
  const beta = Math.sqrt(1 - resolved.e * resolved.e);
  const keplerDenominator = 1 - resolved.e * cosineE;
  const perifocalPosition = {
    x: resolved.aAu * (cosineE - resolved.e),
    y: resolved.aAu * beta * sineE,
    z: 0
  };
  const afterPeriapsis = rotateZ(perifocalPosition, resolved.argPeriapsisRad);
  const afterInclination = rotateX(afterPeriapsis, resolved.iRad);
  const sourcePosition = rotateZ(afterInclination, resolved.ascendingNodeRad);
  const eclipticPosition = transformByBasis(sourcePosition, orbit.sourceFrameBasis);
  outPosition.set(eclipticPosition.x, eclipticPosition.y, eclipticPosition.z);
  if (!outVelocity) {
    return;
  }
  const eccentricAnomalyRate = (resolved.meanMotionRadPerDay + resolved.eRatePerDay * sineE) / keplerDenominator;
  const betaRate = beta > 0 ? -resolved.e * resolved.eRatePerDay / beta : 0;
  const perifocalVelocity = {
    x: resolved.aRateAuPerDay * (cosineE - resolved.e) + resolved.aAu * (-sineE * eccentricAnomalyRate - resolved.eRatePerDay),
    y: resolved.aRateAuPerDay * beta * sineE + resolved.aAu * (betaRate * sineE + beta * cosineE * eccentricAnomalyRate),
    z: 0
  };
  const velocityAfterPeriapsis = add(
    rotateZ(perifocalVelocity, resolved.argPeriapsisRad),
    scale(cross({ x: 0, y: 0, z: 1 }, afterPeriapsis), resolved.argPeriapsisRateRadPerDay)
  );
  const velocityAfterInclination = add(
    rotateX(velocityAfterPeriapsis, resolved.iRad),
    scale(cross({ x: 1, y: 0, z: 0 }, afterInclination), resolved.iRateRadPerDay)
  );
  const sourceVelocity = add(
    rotateZ(velocityAfterInclination, resolved.ascendingNodeRad),
    scale(cross({ x: 0, y: 0, z: 1 }, sourcePosition), resolved.ascendingNodeRateRadPerDay)
  );
  const eclipticVelocity = transformByBasis(sourceVelocity, orbit.sourceFrameBasis);
  outVelocity.set(eclipticVelocity.x, eclipticVelocity.y, eclipticVelocity.z);
}

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/sim/orbitMath.ts
var TWO_PI3 = Math.PI * 2;
var DEG_TO_RAD3 = Math.PI / 180;
var JULIAN_CENTURY_DAYS2 = 36525;
function degToRad(deg) {
  return deg * DEG_TO_RAD3;
}
function normalizeRadians3(angle) {
  const reduced = angle % TWO_PI3;
  return reduced >= 0 ? reduced : reduced + TWO_PI3;
}
function solveKeplerFast(M, e) {
  let E = M;
  for (let i = 0; i < 6; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}
function solveKepler3(meanAnomalyRad, eccentricity, tolerance = 1e-9, maxIterations = 20) {
  const e = Math.max(0, Math.min(0.9999999, eccentricity));
  let eccentricAnomaly = e < 0.8 ? meanAnomalyRad : Math.PI;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const f = eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomalyRad;
    const fPrime = 1 - e * Math.cos(eccentricAnomaly);
    const delta = f / fPrime;
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < tolerance) {
      break;
    }
  }
  return eccentricAnomaly;
}
function clampEccentricity(eccentricity) {
  return Math.max(0, Math.min(0.9999999, eccentricity));
}
function resolveKeplerOrbitAtElapsedDays(orbit, elapsedDays) {
  const centuriesSinceEpoch = elapsedDays / JULIAN_CENTURY_DAYS2;
  const secularRates = orbit.secularRates;
  const baseA = Math.max(1e-9, orbit.aAu);
  const a = Math.max(1e-9, baseA + (secularRates?.aAuPerCentury ?? 0) * centuriesSinceEpoch);
  const e = clampEccentricity((orbit.e ?? 0) + (secularRates?.ePerCentury ?? 0) * centuriesSinceEpoch);
  const iRad = degToRad((orbit.iDeg ?? 0) + (secularRates?.iDegPerCentury ?? 0) * centuriesSinceEpoch);
  const ascendingNodeRad = degToRad(
    (orbit.ascendingNodeDeg ?? 0) + (secularRates?.ascendingNodeDegPerCentury ?? 0) * centuriesSinceEpoch
  );
  const argPeriapsisRad = degToRad(
    (orbit.argPeriapsisDeg ?? 0) + (secularRates?.argPeriapsisDegPerCentury ?? 0) * centuriesSinceEpoch
  );
  const basePeriodDays = Math.max(1e-9, orbit.periodDays);
  const periodDays = basePeriodDays * Math.pow(a / baseA, 1.5);
  const meanLongitudeRate = secularRates?.meanLongitudeDegPerCentury;
  const varpiDegPerCentury = (secularRates?.ascendingNodeDegPerCentury ?? 0) + (secularRates?.argPeriapsisDegPerCentury ?? 0);
  let meanMotionRadPerDay;
  let meanAnomalyRad;
  if (meanLongitudeRate === void 0) {
    const varpiRadPerDay = secularRates?.periodIsMeanLongitudePeriod ? degToRad(varpiDegPerCentury) / JULIAN_CENTURY_DAYS2 : 0;
    meanMotionRadPerDay = TWO_PI3 / periodDays - varpiRadPerDay;
    meanAnomalyRad = normalizeRadians3(degToRad(orbit.meanAnomalyDeg ?? 0) + meanMotionRadPerDay * elapsedDays);
  } else {
    const meanAnomalyDegPerCentury = meanLongitudeRate - varpiDegPerCentury;
    meanMotionRadPerDay = degToRad(meanAnomalyDegPerCentury) / JULIAN_CENTURY_DAYS2;
    const meanAnomalyDeg = ((orbit.meanAnomalyDeg ?? 0) + meanAnomalyDegPerCentury * centuriesSinceEpoch) % 360;
    meanAnomalyRad = normalizeRadians3(degToRad(meanAnomalyDeg));
  }
  return {
    aAu: a,
    e,
    iRad,
    ascendingNodeRad,
    argPeriapsisRad,
    meanAnomalyRad,
    periodDays,
    meanMotionRadPerDay,
    centuriesSinceEpoch
  };
}
function propagateKeplerOrbit(orbit, elapsedDays, outPosition, outVelocity = null) {
  if (orbit.ephemeris && propagateMoonEphemeris(
    orbit.ephemeris,
    orbit.epochJd + elapsedDays,
    outPosition,
    outVelocity
  )) {
    return true;
  }
  if (orbit.ephemerisRequired) return false;
  if (isSourceFrameKeplerOrbit(orbit)) {
    propagateSourceFrameOrbit(orbit, elapsedDays, outPosition, outVelocity);
    return true;
  }
  const resolved = resolveKeplerOrbitAtElapsedDays(orbit, elapsedDays);
  const a = resolved.aAu;
  const e = resolved.e;
  const i = resolved.iRad;
  const ascendingNode = resolved.ascendingNodeRad;
  const argPeriapsis = resolved.argPeriapsisRad;
  const meanAnomaly = resolved.meanAnomalyRad;
  const meanMotion = resolved.meanMotionRadPerDay;
  const eccentricAnomaly = solveKepler3(meanAnomaly, e);
  const cosE = Math.cos(eccentricAnomaly);
  const sinE = Math.sin(eccentricAnomaly);
  const sqrtOneMinusESquared = Math.sqrt(1 - e * e);
  const radius = a * (1 - e * cosE);
  const cosNu = (cosE - e) / (1 - e * cosE);
  const sinNu = sqrtOneMinusESquared * sinE / (1 - e * cosE);
  const trueAnomaly = Math.atan2(sinNu, cosNu);
  const argLatitude = argPeriapsis + trueAnomaly;
  const cosArgLatitude = Math.cos(argLatitude);
  const sinArgLatitude = Math.sin(argLatitude);
  const cosNode = Math.cos(ascendingNode);
  const sinNode = Math.sin(ascendingNode);
  const cosInclination = Math.cos(i);
  const sinInclination = Math.sin(i);
  const x = radius * (cosNode * cosArgLatitude - sinNode * sinArgLatitude * cosInclination);
  const y = radius * (sinNode * cosArgLatitude + cosNode * sinArgLatitude * cosInclination);
  const z = radius * (sinArgLatitude * sinInclination);
  outPosition.set(x, y, z);
  if (outVelocity) {
    const factor = meanMotion * a / (1 - e * cosE);
    const vxPerifocal = -factor * sinE;
    const vyPerifocal = factor * sqrtOneMinusESquared * cosE;
    const cosArgPeriapsis = Math.cos(argPeriapsis);
    const sinArgPeriapsis = Math.sin(argPeriapsis);
    const vx1 = vxPerifocal * cosArgPeriapsis - vyPerifocal * sinArgPeriapsis;
    const vy1 = vxPerifocal * sinArgPeriapsis + vyPerifocal * cosArgPeriapsis;
    const vx2 = vx1;
    const vy2 = vy1 * cosInclination;
    const vz2 = vy1 * sinInclination;
    const vx = vx2 * cosNode - vy2 * sinNode;
    const vy = vx2 * sinNode + vy2 * cosNode;
    const vz = vz2;
    outVelocity.set(vx, vy, vz);
  }
  return true;
}

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/constants.ts
var AU_KM2 = 1495978707e-1;
var AU_M = AU_KM2 * 1e3;
var DAY_SECONDS = 86400;
var DAY_MILLISECONDS = DAY_SECONDS * 1e3;
var J2000_JD = 2451545;
var MAJOR_BODY_IDS = [
  "sun",
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto"
];
function julianDateFromUnixMs(unixMs) {
  return unixMs / DAY_MILLISECONDS + 24405875e-1;
}
var TAI_MINUS_UTC_STEPS = [
  [Date.UTC(1972, 0, 1), 10],
  [Date.UTC(1972, 6, 1), 11],
  [Date.UTC(1973, 0, 1), 12],
  [Date.UTC(1974, 0, 1), 13],
  [Date.UTC(1975, 0, 1), 14],
  [Date.UTC(1976, 0, 1), 15],
  [Date.UTC(1977, 0, 1), 16],
  [Date.UTC(1978, 0, 1), 17],
  [Date.UTC(1979, 0, 1), 18],
  [Date.UTC(1980, 0, 1), 19],
  [Date.UTC(1981, 6, 1), 20],
  [Date.UTC(1982, 6, 1), 21],
  [Date.UTC(1983, 6, 1), 22],
  [Date.UTC(1985, 6, 1), 23],
  [Date.UTC(1988, 0, 1), 24],
  [Date.UTC(1990, 0, 1), 25],
  [Date.UTC(1991, 0, 1), 26],
  [Date.UTC(1992, 6, 1), 27],
  [Date.UTC(1993, 6, 1), 28],
  [Date.UTC(1994, 6, 1), 29],
  [Date.UTC(1996, 0, 1), 30],
  [Date.UTC(1997, 6, 1), 31],
  [Date.UTC(1999, 0, 1), 32],
  [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34],
  [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2015, 6, 1), 36],
  [Date.UTC(2017, 0, 1), 37]
];
function clamp3(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function sanitizeIdPart(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function parseEpochDateToJulian(epoch) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:\.(\d+))?$/.exec(epoch);
  if (!match) {
    return J2000_JD;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayInteger = Number(match[3]);
  const fractionalText = match[4] || "";
  const dayFraction = fractionalText.length > 0 ? Number(`0.${fractionalText}`) : 0;
  const unixMs = Date.UTC(year, month - 1, dayInteger, 0, 0, 0, 0);
  const jd = julianDateFromUnixMs(unixMs);
  return jd + dayFraction;
}

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/data/planets.ts
var SUN = {
  id: "sun",
  name: "Sun",
  type: "star",
  massKg: 198847e25,
  radiusKm: 696340,
  color: "#f6d165",
  axialTiltDeg: 7.25,
  rotationPeriodHours: 609.12
};
var PLANETS = [
  {
    id: "mercury",
    name: "Mercury",
    type: "planet",
    massKg: 33011e19,
    radiusKm: 2439.7,
    color: "#a89a86",
    axialTiltDeg: 0.034,
    rotationPeriodHours: 1407.6,
    orbit: {
      epochJd: J2000_JD,
      aAu: 0.38709927,
      e: 0.20563593,
      iDeg: 7.00497902,
      ascendingNodeDeg: 48.33076593,
      argPeriapsisDeg: 29.12703035,
      meanAnomalyDeg: 174.79252722,
      periodDays: 87.9691,
      secularRates: {
        aAuPerCentury: 37e-8,
        ePerCentury: 1906e-8,
        iDegPerCentury: -594749e-8,
        ascendingNodeDegPerCentury: -0.12534081,
        argPeriapsisDegPerCentury: 0.2858177,
        meanLongitudeDegPerCentury: 149472.67411175
      }
    }
  },
  {
    id: "venus",
    name: "Venus",
    type: "planet",
    massKg: 48675e20,
    radiusKm: 6051.8,
    color: "#d6b481",
    axialTiltDeg: 177.36,
    rotationPeriodHours: -5832.5,
    orbit: {
      epochJd: J2000_JD,
      aAu: 0.72333566,
      e: 677672e-8,
      iDeg: 3.39467605,
      ascendingNodeDeg: 76.67984255,
      argPeriapsisDeg: 54.92262463,
      meanAnomalyDeg: 50.37663232,
      periodDays: 224.701,
      secularRates: {
        aAuPerCentury: 39e-7,
        ePerCentury: -4107e-8,
        iDegPerCentury: -7889e-7,
        ascendingNodeDegPerCentury: -0.27769418,
        argPeriapsisDegPerCentury: 0.28037747,
        meanLongitudeDegPerCentury: 58517.81538729
      }
    }
  },
  {
    id: "earth",
    name: "Earth",
    type: "planet",
    massKg: 597237e19,
    radiusKm: 6371,
    equatorialRadiusKm: 6378.137,
    polarRadiusKm: 6356.752,
    color: "#4f8fdb",
    axialTiltDeg: 23.439281,
    rotationPeriodHours: 23.9344696,
    // Align Earth day-map prime meridian with the orbital frame used in the scene.
    rotationPhaseDeg: -90,
    orbit: {
      epochJd: J2000_JD,
      aAu: 1.00000261,
      e: 0.01671123,
      iDeg: -1531e-8,
      ascendingNodeDeg: 0,
      argPeriapsisDeg: 102.93768193,
      meanAnomalyDeg: 357.52688973,
      periodDays: 365.256,
      secularRates: {
        aAuPerCentury: 562e-8,
        ePerCentury: -4392e-8,
        iDegPerCentury: -0.01294668,
        ascendingNodeDegPerCentury: 0,
        argPeriapsisDegPerCentury: 0.32327364,
        meanLongitudeDegPerCentury: 35999.37244981
      }
    }
  },
  {
    id: "mars",
    name: "Mars",
    type: "planet",
    massKg: 64171e19,
    radiusKm: 3389.5,
    color: "#d16f54",
    axialTiltDeg: 25.19,
    rotationPeriodHours: 24.6229,
    orbit: {
      epochJd: J2000_JD,
      aAu: 1.52371034,
      e: 0.0933941,
      iDeg: 1.84969142,
      ascendingNodeDeg: 49.55953891,
      argPeriapsisDeg: 286.4968315,
      meanAnomalyDeg: 19.39019754,
      periodDays: 686.98,
      secularRates: {
        aAuPerCentury: 1847e-8,
        ePerCentury: 7882e-8,
        iDegPerCentury: -813131e-8,
        ascendingNodeDegPerCentury: -0.29257343,
        argPeriapsisDegPerCentury: 0.73698431,
        meanLongitudeDegPerCentury: 19140.30268499
      }
    }
  },
  {
    id: "jupiter",
    name: "Jupiter",
    type: "planet",
    massKg: 18982e23,
    radiusKm: 69911,
    color: "#c7a06b",
    axialTiltDeg: 3.13,
    rotationPeriodHours: 9.925,
    orbit: {
      epochJd: J2000_JD,
      aAu: 5.202887,
      e: 0.04838624,
      iDeg: 1.30439695,
      ascendingNodeDeg: 100.47390909,
      argPeriapsisDeg: 274.25457074,
      meanAnomalyDeg: 19.66796068,
      periodDays: 4332.589,
      secularRates: {
        aAuPerCentury: -11607e-8,
        ePerCentury: -13253e-8,
        iDegPerCentury: -183714e-8,
        ascendingNodeDegPerCentury: 0.20469106,
        argPeriapsisDegPerCentury: 783562e-8,
        meanLongitudeDegPerCentury: 3034.74612775
      }
    }
  },
  {
    id: "saturn",
    name: "Saturn",
    type: "planet",
    massKg: 56834e22,
    radiusKm: 58232,
    color: "#d4bf89",
    axialTiltDeg: 26.73,
    // Approximate north-pole direction in ecliptic longitude (deg).
    spinAxisLongitudeDeg: 79.53,
    rotationPeriodHours: 10.656,
    orbit: {
      epochJd: J2000_JD,
      aAu: 9.53667594,
      e: 0.05386179,
      iDeg: 2.48599187,
      ascendingNodeDeg: 113.66242448,
      argPeriapsisDeg: 338.93645383,
      meanAnomalyDeg: 317.35536592,
      periodDays: 10759.22,
      secularRates: {
        aAuPerCentury: -12506e-7,
        ePerCentury: -50991e-8,
        iDegPerCentury: 193609e-8,
        ascendingNodeDegPerCentury: -0.28867794,
        argPeriapsisDegPerCentury: -0.13029422,
        meanLongitudeDegPerCentury: 1222.49362201
      }
    }
  },
  {
    id: "uranus",
    name: "Uranus",
    type: "planet",
    massKg: 8681e22,
    radiusKm: 25362,
    color: "#8fd7de",
    axialTiltDeg: 97.77,
    // Approximate north-pole direction in ecliptic longitude (deg).
    spinAxisLongitudeDeg: 257.65,
    rotationPeriodHours: -17.24,
    orbit: {
      epochJd: J2000_JD,
      aAu: 19.18916464,
      e: 0.04725744,
      iDeg: 0.77263783,
      ascendingNodeDeg: 74.01692503,
      argPeriapsisDeg: 96.93735127,
      meanAnomalyDeg: 142.28382821,
      periodDays: 30685.4,
      secularRates: {
        aAuPerCentury: -196176e-8,
        ePerCentury: -4397e-8,
        iDegPerCentury: -242939e-8,
        ascendingNodeDegPerCentury: 0.04240589,
        argPeriapsisDegPerCentury: 0.36564692,
        meanLongitudeDegPerCentury: 428.48202785
      }
    }
  },
  {
    id: "neptune",
    name: "Neptune",
    type: "planet",
    massKg: 102413e21,
    radiusKm: 24622,
    color: "#4a76d9",
    axialTiltDeg: 28.32,
    rotationPeriodHours: 16.11,
    orbit: {
      epochJd: J2000_JD,
      aAu: 30.06992276,
      e: 859048e-8,
      iDeg: 1.77004347,
      ascendingNodeDeg: 131.78422574,
      argPeriapsisDeg: 273.18053653,
      meanAnomalyDeg: 259.91520804,
      periodDays: 60189,
      secularRates: {
        aAuPerCentury: 26291e-8,
        ePerCentury: 5105e-8,
        iDegPerCentury: 35372e-8,
        ascendingNodeDegPerCentury: -508664e-8,
        argPeriapsisDegPerCentury: -0.317328,
        meanLongitudeDegPerCentury: 218.45945325
      }
    }
  },
  {
    id: "pluto",
    name: "Pluto",
    type: "dwarf",
    massKg: 1303e19,
    radiusKm: 1188.3,
    color: "#b7a38d",
    axialTiltDeg: 122.53,
    rotationPeriodHours: -153.2928,
    orbit: {
      epochJd: J2000_JD,
      aAu: 39.48211675,
      e: 0.2488273,
      iDeg: 17.14001206,
      ascendingNodeDeg: 110.30393684,
      argPeriapsisDeg: 113.76497945,
      meanAnomalyDeg: 14.86012204,
      periodDays: 90560
    }
  }
];
var MAJOR_MOON_RADII_KM = {
  Moon: 1737.4,
  Phobos: 11.08,
  Deimos: 6.2,
  Io: 1821.6,
  Europa: 1560.8,
  Ganymede: 2634.1,
  Callisto: 2410.3,
  Amalthea: 83.45,
  Himalia: 69.8,
  Elara: 43,
  Pasiphae: 28.9,
  Sinope: 19,
  Lysithea: 18,
  Carme: 23,
  Ananke: 14,
  Leda: 10,
  Thebe: 49.3,
  Adrastea: 8.2,
  Metis: 21.5,
  Titan: 2574.7,
  Rhea: 763.8,
  Iapetus: 734.5,
  Dione: 561.4,
  Tethys: 531.1,
  Enceladus: 252.1,
  Mimas: 198.2,
  Hyperion: 133,
  Phoebe: 106.6,
  Janus: 89.5,
  Epimetheus: 58.1,
  Helene: 18,
  Titania: 788.9,
  Oberon: 761.4,
  Umbriel: 584.7,
  Ariel: 578.9,
  Miranda: 235.8,
  Triton: 1353.4,
  Nereid: 170,
  Proteus: 210,
  Larissa: 97,
  Galatea: 88,
  Despina: 75,
  Charon: 606,
  Nix: 23,
  Hydra: 31,
  Kerberos: 9,
  Styx: 5
};
var MAJOR_MOON_SHAPE_KM = {
  Moon: {
    equatorialRadiusKm: 1738.1,
    polarRadiusKm: 1736
  }
};
var MOON_ROTATION_PERIOD_HOURS = {
  // Tidally locked to Mars with period matching each moon's mean orbital period.
  Phobos: 7.6488,
  Deimos: 30.3
};
var MAJOR_MOONS = /* @__PURE__ */ new Set([
  "Moon",
  "Phobos",
  "Deimos",
  "Io",
  "Europa",
  "Ganymede",
  "Callisto",
  "Titan",
  "Rhea",
  "Iapetus",
  "Dione",
  "Tethys",
  "Enceladus",
  "Mimas",
  "Titania",
  "Oberon",
  "Umbriel",
  "Ariel",
  "Miranda",
  "Triton",
  "Charon"
]);

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/data/asteroidCatalogLoader.ts
var MAGIC = "ACBF";
var MAGIC_BYTES = new Uint8Array([65, 67, 66, 70]);
var VERSION = 1;
var HEADER_BYTES = 12;
var STRIDE_BYTES = 36;
var ANGLE_SCALE_U16 = 65535;
var ECENTRICITY_SCALE_U16 = 65535;
var ALBEDO_SCALE_U16 = 65535;
var PERIOD_EPSILON_DAYS = 1e-4;
var A_EPSILON_AU = 1e-6;
var ECC_EPSILON = 1 / ECENTRICITY_SCALE_U16;
var ANGLE_EPSILON_DEG = 360 / ANGLE_SCALE_U16;
var DIAMETER_EPSILON_KM = 1e-5;
var ALBEDO_EPSILON = 1 / ALBEDO_SCALE_U16;
function throwIfInvalidBuffer(buffer, expectedBytes) {
  if (buffer.byteLength < expectedBytes) {
    throw new Error(`Asteroid catalog buffer is too small: expected ${expectedBytes}, got ${buffer.byteLength}.`);
  }
}
function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
function normalizeAngle360(value) {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}
function packUnsignedShort(value, min, max) {
  const normalized = clampNumber(value, min, max);
  const ratio = (normalized - min) / (max - min);
  return Math.max(0, Math.min(ANGLE_SCALE_U16, Math.round(ratio * ANGLE_SCALE_U16)));
}
function unpackUnsignedShort(raw, min, max) {
  const ratio = clampNumber(raw, 0, ANGLE_SCALE_U16) / ANGLE_SCALE_U16;
  return min + ratio * (max - min);
}
function packSourceId(sourceId) {
  if (!Number.isFinite(sourceId)) return 0;
  const rounded = Math.trunc(sourceId);
  if (rounded <= 0) return 0;
  if (rounded >= 4294967296) return 4294967295;
  return rounded >>> 0;
}
function packTaxonomyIndex(index) {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(index)));
}
function toHeaderView(count) {
  const buffer = new ArrayBuffer(HEADER_BYTES);
  const header = new DataView(buffer);
  for (let i = 0; i < MAGIC_BYTES.length; i += 1) {
    header.setUint8(i, MAGIC_BYTES[i]);
  }
  header.setUint8(4, VERSION);
  header.setUint8(5, 0);
  header.setUint8(6, STRIDE_BYTES);
  header.setUint8(7, 0);
  header.setUint32(8, count, true);
  return header;
}
function readHeaderView(buffer) {
  const header = new DataView(buffer);
  const magic = String.fromCharCode(
    header.getUint8(0),
    header.getUint8(1),
    header.getUint8(2),
    header.getUint8(3)
  );
  if (magic !== MAGIC) {
    throw new Error(`Unsupported catalog magic "${magic}". Expected "${MAGIC}".`);
  }
  const version = header.getUint8(4);
  if (version !== VERSION) {
    throw new Error(`Unsupported catalog version ${version}. Supported version is ${VERSION}.`);
  }
  const strideBytes = header.getUint8(6);
  if (strideBytes !== STRIDE_BYTES) {
    throw new Error(`Unexpected record stride ${strideBytes}. Expected ${STRIDE_BYTES} bytes.`);
  }
  return {
    magic,
    version,
    flags: header.getUint8(5),
    strideBytes,
    recordCount: header.getUint32(8, true)
  };
}
function writeAsteroidCatalogBinary(records) {
  const count = records.length;
  const bytes = HEADER_BYTES + count * STRIDE_BYTES;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  const header = toHeaderView(count);
  new Uint8Array(buffer, 0, HEADER_BYTES).set(new Uint8Array(header.buffer));
  const payloadStart = HEADER_BYTES;
  for (let i = 0; i < count; i += 1) {
    const record = records[i];
    const baseOffset = payloadStart + i * STRIDE_BYTES;
    const eClamped = clampNumber(record.e, 0, 1);
    const epoch = clampNumber(record.epochJd, -Infinity, Infinity);
    const aAu = clampNumber(record.aAu, 1e-4, 1e4);
    const iDeg = clampNumber(record.iDeg, 0, 180);
    const asc = normalizeAngle360(record.ascendingNodeDeg);
    const arg = normalizeAngle360(record.argPeriapsisDeg);
    const man = normalizeAngle360(record.meanAnomalyDeg);
    const period = clampNumber(record.periodDays, 1, 1e7);
    const diameter = clampNumber(record.diameterKm, 1e-3, 1e6);
    const albedo = clampNumber(record.albedo, 0, 1);
    const eQ = packUnsignedShort(eClamped, 0, 1);
    const iQ = packUnsignedShort(iDeg, 0, 180);
    const ascQ = packUnsignedShort(asc, 0, 360);
    const argQ = packUnsignedShort(arg, 0, 360);
    const manQ = packUnsignedShort(man, 0, 360);
    const albedoQ = packUnsignedShort(albedo, 0, 1);
    view.setUint32(baseOffset, packSourceId(record.sourceId), true);
    view.setFloat32(baseOffset + 4, epoch, true);
    view.setFloat32(baseOffset + 8, aAu, true);
    view.setUint16(baseOffset + 12, eQ, true);
    view.setUint16(baseOffset + 14, iQ, true);
    view.setUint16(baseOffset + 16, ascQ, true);
    view.setUint16(baseOffset + 18, argQ, true);
    view.setUint16(baseOffset + 20, manQ, true);
    view.setFloat32(baseOffset + 22, period, true);
    view.setFloat32(baseOffset + 26, diameter, true);
    view.setUint16(baseOffset + 30, albedoQ, true);
    view.setUint8(baseOffset + 32, packTaxonomyIndex(record.taxonomyIndex));
    view.setUint8(baseOffset + 33, 0);
    view.setUint16(baseOffset + 34, 0, true);
  }
  return buffer;
}
function readAsteroidCatalogBinary(buffer, options = {}) {
  throwIfInvalidBuffer(buffer, HEADER_BYTES);
  const header = readHeaderView(buffer);
  const maxBytes = HEADER_BYTES + header.recordCount * header.strideBytes;
  throwIfInvalidBuffer(buffer, maxBytes);
  const recordCount = options.maxRecords == null ? header.recordCount : Math.max(0, Math.min(options.maxRecords, header.recordCount));
  const view = new DataView(buffer, HEADER_BYTES);
  const records = [];
  records.length = recordCount;
  for (let i = 0; i < recordCount; i += 1) {
    const baseOffset = i * header.strideBytes;
    const sourceId = view.getUint32(baseOffset, true);
    const epochJd = view.getFloat32(baseOffset + 4, true);
    const aAu = view.getFloat32(baseOffset + 8, true);
    const e = unpackUnsignedShort(view.getUint16(baseOffset + 12, true), 0, 1);
    const iDeg = unpackUnsignedShort(view.getUint16(baseOffset + 14, true), 0, 180);
    const ascendingNodeDeg = unpackUnsignedShort(view.getUint16(baseOffset + 16, true), 0, 360);
    const argPeriapsisDeg = unpackUnsignedShort(view.getUint16(baseOffset + 18, true), 0, 360);
    const meanAnomalyDeg = unpackUnsignedShort(view.getUint16(baseOffset + 20, true), 0, 360);
    const periodDays = view.getFloat32(baseOffset + 22, true);
    const diameterKm = view.getFloat32(baseOffset + 26, true);
    const albedo = unpackUnsignedShort(view.getUint16(baseOffset + 30, true), 0, 1);
    const taxonomyIndex = view.getUint8(baseOffset + 32);
    records[i] = {
      sourceId,
      epochJd: Number.isFinite(epochJd) ? epochJd : 0,
      aAu: Number.isFinite(aAu) ? aAu : 0,
      e,
      iDeg,
      ascendingNodeDeg,
      argPeriapsisDeg,
      meanAnomalyDeg,
      periodDays: Number.isFinite(periodDays) ? periodDays : 0,
      diameterKm: Number.isFinite(diameterKm) ? diameterKm : 0,
      albedo,
      taxonomyIndex
    };
  }
  return {
    header,
    records
  };
}
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function generateDeterministicRecords(count, seed = 324508639) {
  const rng = mulberry32(seed);
  const records = [];
  records.length = count;
  for (let i = 0; i < count; i += 1) {
    const t = i + 1;
    const aAu = 2 + 1.5 * rng();
    const e = 1e-3 + rng() * 0.99;
    const iDeg = rng() * 179;
    const ascendingNodeDeg = normalizeAngle360(rng() * 720);
    const argPeriapsisDeg = normalizeAngle360(rng() * 720 - 180);
    const meanAnomalyDeg = normalizeAngle360(rng() * 720 + 40);
    const periodDays = 365.25 * Math.pow(aAu, 1.5);
    const diameterKm = 0.5 + rng() * 200;
    const albedo = 0.04 + rng() * 0.55;
    records[i] = {
      sourceId: t,
      epochJd: 2451e3 + i % 12e3 * 0.125 + rng() * 0.25,
      aAu,
      e,
      iDeg,
      ascendingNodeDeg,
      argPeriapsisDeg,
      meanAnomalyDeg,
      periodDays,
      diameterKm,
      albedo,
      taxonomyIndex: t % 3
    };
  }
  return records;
}
function compareRecords(a, b) {
  const mismatches = [];
  if (a.sourceId !== b.sourceId) mismatches.push(1);
  if (Math.abs(a.epochJd - b.epochJd) > PERIOD_EPSILON_DAYS) mismatches.push(1);
  if (Math.abs(a.aAu - b.aAu) > A_EPSILON_AU) mismatches.push(1);
  if (Math.abs(a.e - b.e) > ECC_EPSILON) mismatches.push(1);
  if (Math.abs(a.iDeg - b.iDeg) > ANGLE_EPSILON_DEG) mismatches.push(1);
  if (Math.abs(a.ascendingNodeDeg - b.ascendingNodeDeg) > ANGLE_EPSILON_DEG) mismatches.push(1);
  if (Math.abs(a.argPeriapsisDeg - b.argPeriapsisDeg) > ANGLE_EPSILON_DEG) mismatches.push(1);
  if (Math.abs(a.meanAnomalyDeg - b.meanAnomalyDeg) > ANGLE_EPSILON_DEG) mismatches.push(1);
  if (Math.abs(a.periodDays - b.periodDays) > PERIOD_EPSILON_DAYS) mismatches.push(1);
  if (Math.abs(a.diameterKm - b.diameterKm) > DIAMETER_EPSILON_KM) mismatches.push(1);
  if (Math.abs(a.albedo - b.albedo) > ALBEDO_EPSILON) mismatches.push(1);
  if (a.taxonomyIndex !== b.taxonomyIndex) mismatches.push(1);
  return mismatches;
}
function validatePackedCatalogRoundTrip(count) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`Expected count > 0, got ${count}.`);
  }
  if (count > 2e6) {
    throw new Error(`Round-trip test count too high (${count}); limit is 2_000_000.`);
  }
  const source = generateDeterministicRecords(count);
  const packed = writeAsteroidCatalogBinary(source);
  const parsed = readAsteroidCatalogBinary(packed);
  let mismatched = 0;
  let maxEpochError = 0;
  let maxAUError = 0;
  let maxEError = 0;
  let maxAngleError = 0;
  let maxDiameterError = 0;
  let maxAlbedoError = 0;
  for (let i = 0; i < source.length; i += 1) {
    const sourceRecord = source[i];
    const decoded = parsed.records[i];
    const deltaEpoch = Math.abs(sourceRecord.epochJd - decoded.epochJd);
    const deltaAU = Math.abs(sourceRecord.aAu - decoded.aAu);
    const deltaE = Math.abs(sourceRecord.e - decoded.e);
    const deltaI = Math.abs(sourceRecord.iDeg - decoded.iDeg);
    const deltaAsc = Math.abs(sourceRecord.ascendingNodeDeg - decoded.ascendingNodeDeg);
    const deltaArg = Math.abs(sourceRecord.argPeriapsisDeg - decoded.argPeriapsisDeg);
    const deltaM = Math.abs(sourceRecord.meanAnomalyDeg - decoded.meanAnomalyDeg);
    const deltaP = Math.abs(sourceRecord.periodDays - decoded.periodDays);
    const deltaD = Math.abs(sourceRecord.diameterKm - decoded.diameterKm);
    const deltaAlb = Math.abs(sourceRecord.albedo - decoded.albedo);
    const angleMax = Math.max(deltaI, deltaAsc, deltaArg, deltaM);
    const errors = [
      deltaEpoch,
      deltaAU,
      deltaE,
      angleMax,
      deltaP,
      deltaD,
      deltaAlb
    ];
    if (errors[0] + errors[1] + errors[2] + errors[3] + errors[4] + errors[5] + errors[6] > 0) {
      mismatched += compareRecords(sourceRecord, decoded).length > 0 ? 1 : 0;
    }
    if (deltaEpoch > maxEpochError) maxEpochError = deltaEpoch;
    if (deltaAU > maxAUError) maxAUError = deltaAU;
    if (deltaE > maxEError) maxEError = deltaE;
    if (angleMax > maxAngleError) maxAngleError = angleMax;
    if (deltaD > maxDiameterError) maxDiameterError = deltaD;
    if (deltaAlb > maxAlbedoError) maxAlbedoError = deltaAlb;
  }
  return {
    version: VERSION,
    sourceCount: source.length,
    encodedBytes: packed.byteLength,
    mismatchedRecords: mismatched,
    maxEpochErrorDays: maxEpochError,
    maxAUError,
    maxECCError: maxEError,
    maxAngleErrorDeg: maxAngleError,
    maxDiameterErrorKm: maxDiameterError,
    maxAlbedoError,
    ok: mismatched === 0
  };
}
function validatePackedCatalogRoundTrip100k() {
  return validatePackedCatalogRoundTrip(1e5);
}

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts
var C_CM_S = 2998e7;
var G_CGS = 6674e-11;
var AU_CM = 1496e10;
var SGR_A = Object.freeze({
  key: "SagittariusA",
  label: "Sagittarius A*",
  galaxy: "Milky Way",
  type: "quiescent SMBH",
  massMsun: 4154e3,
  massG: 4154e3 * 1989e30,
  distanceKpc: 8.178,
  distanceCm: 8.178 * 3086e18,
  distanceLy: 26673,
  rSchwarzschildCm: 124e8,
  // 0.083 AU
  rIscoCm: 372e8,
  // Schwarzschild ISCO = 3 R_s
  rPhotonCm: 186e8,
  // 1.5 R_s
  angularSizeUas: 52,
  // μas on sky (EHT)
  luminosityCurrent: 1e36,
  // erg/s
  luminosityEddington: 52e43,
  // erg/s
  accretionRateCurrent: 1e-8,
  // M☉/yr
  lOverLedd: 1e-9,
  spinEstimate: 0.5,
  // a* (poorly constrained, 0.1-0.9)
  bFieldHorizonG: 50,
  // Gauss at event horizon (EHT polarimetry)
  flareRatePerDay: 5.5,
  // JWST 2025 (Chen+ 2025)
  flarePowerLawIndex: 1.7,
  // α in dN/dE ∝ E^(-α)
  pevatronConfirmed: true,
  // HESS 2016, 2024
  pevatronMaxEnergyEV: 1e15,
  jetBeta: 0.9,
  // conservative for current state
  jetThetaDeg: 35,
  // observer angle estimate
  direction: [-0.05, -0.86, 0.5]
  // approximate galactic coordinates
});
var CEN_A = Object.freeze({
  key: "CentaurusA",
  label: "Centaurus A",
  galaxy: "NGC 5128",
  type: "active AGN (nearest)",
  massMsun: 55e6,
  massG: 55e6 * 1989e30,
  distanceMpc: 3.8,
  distanceCm: 3.8 * 3086e21,
  distanceLy: 124e5,
  jetBetaSpine: 0.94,
  // X-ray fast core (Bogensberger+ 2024)
  jetBetaSheath: 0.8,
  // radio slower envelope
  jetBetaAppXray: 2.7,
  // apparent superluminal (confirmed)
  jetThetaDeg: 15,
  // estimated viewing angle
  jetPowerErgS: 1e43,
  jetOpeningDeg: 12,
  lobeSizeKpc: 500,
  // giant radio lobes (~600 kpc diameter)
  uhecrDominant: true,
  // Pierre Auger 2025: main UHECR source
  uhecrExcessAboveEeV: 5,
  // dominates above ~5 EeV
  uhecrMaxEeV: 100,
  uhecrComposition: "CNO at tens EeV, Si/Fe above 50 EeV",
  egmfUpperLimitNG: 6.7,
  // nG·Mpc^(1/2)
  activityTimescaleMyr: 30,
  // active within past ~30 Myr
  direction: [-0.35, -0.45, 0.8]
});
var MAFFEI_1 = Object.freeze({
  key: "Maffei1",
  label: "Maffei 1 (Hidden Giant)",
  galaxy: "Maffei 1",
  type: "giant elliptical (Zone of Avoidance)",
  massMsun: 3e8,
  // M-σ estimate — NO direct measurement
  massG: 3e8 * 1989e30,
  distanceMpc: 2.85,
  distanceCm: 2.85 * 3086e21,
  distanceLy: 93e5,
  extinctionAv: 4.7,
  // visual magnitudes of extinction
  agnStatus: "unknown",
  // cannot observe through MW disk
  sizelyApprox: 75e3,
  jetBeta: 0.92,
  // hypothetical
  jetThetaDeg: 20,
  // hypothetical
  direction: [0.23, 0.18, 0.96]
});
var M87 = Object.freeze({
  key: "M87",
  label: "M87* (Virgo A)",
  galaxy: "M87",
  type: "giant cD elliptical (educational)",
  massMsun: 65e8,
  massG: 65e8 * 1989e30,
  distanceMpc: 16.8,
  distanceCm: 16.8 * 3086e21,
  distanceLy: 547e5,
  rSchwarzschildCm: 19e12,
  // 127 AU — bigger than Pluto's orbit
  jetBeta: 0.98,
  jetBetaApp: 6.3,
  // Biretta+ 1999
  jetPowerErgS: 1e44,
  jetLengthLy: 5e3,
  // visible optical
  jetLengthRadioKpc: 100,
  direction: [0.1, 0.9, 0.4]
  // approximate
});
var SOURCE_CATALOG = Object.freeze({
  SagittariusA: SGR_A,
  CentaurusA: CEN_A,
  Maffei1: MAFFEI_1,
  M87
});
var ISM = Object.freeze({
  diskDensityCgs: 1e-24,
  // g/cm³ (warm ionized medium)
  haloDensityCgs: 1e-27,
  // g/cm³ (hot halo)
  coldNeutralCgs: 5e-23,
  // g/cm³ (cold neutral medium)
  hotIonizedCgs: 5e-27,
  // g/cm³ (hot ionized medium)
  bFieldDiskG: 5e-6,
  // 5 μG (disk average)
  bFieldHaloG: 1e-6,
  // 1 μG (halo)
  bCoherencePc: 100,
  // coherence length
  soundSpeedWarmKmS: 10,
  // warm neutral
  soundSpeedHotKmS: 150,
  // hot ionized (T ~ 10⁶ K)
  crDiffCoeffGeV: 28e27,
  // cm²/s at 1 GeV
  crDiffCoeffTeV: 45e28,
  // cm²/s at 1 TeV
  crDiffCoeffPeV: 7e30,
  // cm²/s at 1 PeV
  crDiffIndex: 0.4,
  // δ in D ∝ E^δ
  crDiffRefRigidityGV: 4
  // reference rigidity
});
var HELIO = Object.freeze({
  heliopauseAu: 120,
  // upwind (Voyager)
  heliopauseDownwindAu: 300,
  // estimated tail
  terminationShockAu: 90,
  // average (Voyager 1: 94 AU)
  helioshealthWidthAu: 30,
  lismVelocityKmS: 26,
  // local ISM velocity relative to Sun
  lismPressureCgs: 2e-12,
  // dyn/cm² (total external pressure)
  alfvenSpeedHeliosheath: 40,
  // km/s
  soundSpeedHeliosheath: 150,
  // km/s (hot shocked solar wind)
  resonantPeriodYr: 2.3,
  // fundamental cavity mode
  qualityFactor: 5
  // estimated Q of heliosphere cavity
});
var FERMI_BUBBLES = Object.freeze({
  innerHeightKpc: 10,
  // Fermi Bubble height (Su+ 2010)
  outerHeightKpc: 15,
  // eROSITA Bubble (Predehl+ 2020)
  innerAgeMyr: 5,
  // Owen+ 2025 (double-episode)
  outerAgeMyr: 15,
  // Owen+ 2025
  energyErg: 1e56,
  // total energy
  temperatureK: 3e7,
  // 3-4 × 10⁶ K (eROSITA)
  expansionKmS: 2e3,
  // current velocity (inner)
  expansionOuterKmS: 1e3,
  // current velocity (outer)
  gammaRayFlux: 5e-7
  // E² dN/dE (GeV/cm²/s/sr)
});
var EVENT_PRESETS = Object.freeze({
  SgrA_CurrentFlare: {
    label: "Sgr A* Typical Flare (NOW)",
    sourceKey: "SagittariusA",
    energyErg: 1e39,
    lorentzFactor: 1.01,
    description: "Typical X-ray flare, happens ~5-6\xD7 per day (JWST 2025)"
  },
  SgrA_SuperFlare: {
    label: "Sgr A* Super-Flare (~300 yr ago)",
    sourceKey: "SagittariusA",
    energyErg: 1e43,
    lorentzFactor: 1.5,
    description: "Seyfert-level flare evidenced by X-ray echoes (Marin+ 2023)"
  },
  SgrA_FermiBubble_Inner: {
    label: "Sgr A* Fermi Bubble Event (~5 Myr ago)",
    sourceKey: "SagittariusA",
    energyErg: 1e56,
    lorentzFactor: 10,
    description: "Inner bubble formation, jet-driven (Owen+ 2025)"
  },
  SgrA_FermiBubble_Outer: {
    label: "Sgr A* eROSITA Bubble Event (~15 Myr ago)",
    sourceKey: "SagittariusA",
    energyErg: 1e57,
    lorentzFactor: 10,
    description: "Outer bubble formation, first jet episode (Owen+ 2025)"
  },
  CenA_CurrentJet: {
    label: "Centaurus A Active Jet (NOW)",
    sourceKey: "CentaurusA",
    energyErg: 1e56,
    lorentzFactor: 5,
    description: "Ongoing jet activity producing UHECRs hitting Earth (Pierre Auger)"
  },
  Maffei1_Hypothetical: {
    label: "Maffei 1 Hidden Outburst (speculative)",
    sourceKey: "Maffei1",
    energyErg: 1e55,
    lorentzFactor: 3,
    description: "Hypothetical AGN outburst from nearest giant elliptical (obscured)"
  },
  M87_Monster: {
    label: "M87* Full Power Jet (educational)",
    sourceKey: "M87",
    energyErg: 1e58,
    lorentzFactor: 30,
    description: "M87 at peak power \u2014 1,560\xD7 Sgr A* mass. Educational visualization."
  },
  MW_M31_Merger: {
    label: "MW-M31 SMBH Merger (~4.5 Gyr future)",
    sourceKey: "SagittariusA",
    energyErg: 1e62,
    lorentzFactor: 100,
    description: "Future merger: h ~ 10\u207B\u2078, \u0394L(1 AU) = 1,500 m per GW cycle"
  },
  SgrA_WarpWave_H29: {
    label: "H29: The Metric-Frame-Dragging Slipstream",
    sourceKey: "SagittariusA",
    energyErg: 5e54,
    lorentzFactor: 1,
    description: "Solitary Alcubierre-like warp bubble. Pure spatial translation, no kinetic acceleration."
  }
});
var CHANNEL_DEFS = Object.freeze([
  {
    key: "gw",
    label: "Gravitational Wave Packet",
    baseAmplitude: 0.15,
    color: [0.3, 0.5, 1],
    // blue
    propagation: "lightspeed",
    // v = c exactly
    energyFraction: 0.01,
    description: "GW travels at c to 15 decimal places (GW170817 constraint)"
  },
  {
    key: "em",
    label: "EM Burst (\u03B3 \u2192 radio)",
    baseAmplitude: 0.4,
    color: [1, 1, 0.8],
    // bright white-yellow
    propagation: "lightspeed",
    // c + ISM dispersion for radio
    energyFraction: 0.1,
    description: "Gamma-ray to radio, subject to ISM absorption/scattering"
  },
  {
    key: "neutrino",
    label: "Neutrino Burst",
    baseAmplitude: 0.05,
    color: [0.5, 0.8, 0.5],
    // pale green
    propagation: "lightspeed",
    // v ≈ c (mass delay < 10⁻¹⁵)
    energyFraction: 0.05,
    description: "Nearly unimpeded, detectable only by km\xB3 detectors"
  },
  {
    key: "uhecr",
    label: "UHECR Front (>10\xB9\u2078 eV)",
    baseAmplitude: 0.6,
    color: [1, 0.6, 0.2],
    // orange
    propagation: "near_ballistic",
    // slight magnetic deflection
    energyFraction: 0.2,
    referenceEnergyEV: 1e18,
    description: "48 J per proton at max energy. Near-ballistic, slight B-field deflection."
  },
  {
    key: "cr_tsunami",
    label: "GeV-TeV Cosmic Ray Tsunami",
    baseAmplitude: 0.8,
    color: [1, 0.3, 0.1],
    // deep orange-red
    propagation: "diffusive",
    // energy-dependent diffusion
    energyFraction: 0.15,
    referenceEnergyEV: 1e12,
    // TeV reference
    description: 'Drawn-out wave lasting 10\u2075-10\u2076 years. This IS the "tsunami".'
  },
  {
    key: "alfven",
    label: "Alfv\xE9n/MHD Wave Front",
    baseAmplitude: 0.3,
    color: [0.6, 0.2, 0.8],
    // purple
    propagation: "alfven",
    // v_A in ISM
    energyFraction: 0.05,
    description: "Propagates at Alfv\xE9n speed (~30-60 km/s in warm ISM)"
  },
  {
    key: "blast",
    label: "Physical Blast Wave",
    baseAmplitude: 1,
    color: [1, 0.1, 0.1],
    // red
    propagation: "sedov_taylor",
    // decelerating blast
    energyFraction: 0.44,
    description: "BM ultrarelativistic \u2192 Sedov-Taylor. The Fermi Bubbles ARE this."
  }
]);
var NANOGRAV = Object.freeze({
  characteristicStrain: 24e-16,
  // h_c at f_ref
  referenceFreqHz: 317e-10,
  // 1/yr ≈ 31.7 nHz
  spectralIndex: -2 / 3,
  // expected for SMBH binary population
  bayesFactor: 1e14,
  // over noise-only models
  gwSpeedConstraint: 5e-16
  // |v_GW/c - 1| upper limit
});
var QED = Object.freeze({
  schwingerBCrit: 4414e10,
  // Gauss
  schwingerECrit: 132e16,
  // V/m
  fineStructure: 1 / 137.036
});

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/sim/solarSystemModel.ts
function makeZeroState() {
  return {
    available: false,
    relativePosition: new Vector3(),
    relativeVelocity: new Vector3(),
    worldPosition: new Vector3(),
    worldVelocity: new Vector3()
  };
}
var SolarSystemModel = class {
  bodies;
  bodyById;
  childrenById;
  stateById;
  parentById;
  updateOrder;
  currentJd;
  constructor(catalog) {
    this.bodies = catalog.bodies;
    this.bodyById = new Map(this.bodies.map((body) => [body.id, body]));
    this.childrenById = /* @__PURE__ */ new Map();
    this.stateById = /* @__PURE__ */ new Map();
    this.parentById = /* @__PURE__ */ new Map();
    for (const body of this.bodies) {
      this.stateById.set(body.id, makeZeroState());
      if (body.parentId) {
        this.parentById.set(body.id, body.parentId);
        if (!this.childrenById.has(body.parentId)) {
          this.childrenById.set(body.parentId, []);
        }
        this.childrenById.get(body.parentId)?.push(body.id);
      }
    }
    this.updateOrder = this.buildUpdateOrder();
    this.currentJd = null;
  }
  buildUpdateOrder() {
    const order = [];
    const roots = this.bodies.filter((body) => !body.parentId).map((body) => body.id);
    const queue = [...roots];
    let head = 0;
    while (head < queue.length) {
      const id = queue[head++];
      order.push(id);
      const children = this.childrenById.get(id);
      if (children) {
        for (const childId of children) {
          queue.push(childId);
        }
      }
    }
    return order;
  }
  getBody(id) {
    return this.bodyById.get(id) ?? null;
  }
  getState(id) {
    return this.stateById.get(id) ?? null;
  }
  getBodies() {
    return this.bodies;
  }
  update(julianDate) {
    this.currentJd = julianDate;
    for (const bodyId of this.updateOrder) {
      const body = this.bodyById.get(bodyId);
      const state = this.stateById.get(bodyId);
      if (!body || !state) continue;
      if (!body.orbit) {
        state.relativePosition.set(0, 0, 0);
        state.relativeVelocity.set(0, 0, 0);
        state.available = true;
      } else {
        const elapsedDays = julianDate - body.orbit.epochJd;
        state.available = propagateKeplerOrbit(
          body.orbit,
          elapsedDays,
          state.relativePosition,
          state.relativeVelocity
        );
      }
      if (body.parentId) {
        const parentState = this.stateById.get(body.parentId);
        if (state.available && parentState?.available) {
          state.worldPosition.copy(parentState.worldPosition).add(state.relativePosition);
          state.worldVelocity.copy(parentState.worldVelocity).add(state.relativeVelocity);
        } else {
          state.available = false;
        }
      } else if (state.available) {
        state.worldPosition.copy(state.relativePosition);
        state.worldVelocity.copy(state.relativeVelocity);
      }
    }
  }
  getWorldPosition(id, target = new Vector3()) {
    const state = this.stateById.get(id);
    if (!state?.available) return null;
    return target.copy(state.worldPosition);
  }
  getWorldVelocity(id, target = new Vector3()) {
    const state = this.stateById.get(id);
    if (!state?.available) return null;
    return target.copy(state.worldVelocity);
  }
  /**
   * Applies a pure metric spatial stretching to world distances relative to the origin.
   * This operates only on the visual coordinates and does not alter orbital velocity or
   * Keplerian state, matching the Alcubierre "pure translation" effect.
   *
   * @param direction - the propagation direction of the wave
   * @param dtSec - time delta in real seconds
   * @param shiftVelocityFn - function that takes a real-world distance in cm from source along axis and returns shift velocity fraction (beta)
   * @param sourceDistanceCm - absolute distance from the origin (Sun) to the AGN source
   * @param visualExaggeration - factor to multiply the shift displacement for visual effect
   */
  applyMetricKinematics(direction, dtSec, shiftVelocityFn, sourceDistanceCm, visualExaggeration = 1e10) {
    if (dtSec <= 0) return;
    for (const bodyId of this.updateOrder) {
      const state = this.stateById.get(bodyId);
      if (!state?.available) continue;
      const projectedDistAu = state.worldPosition.dot(direction);
      const projectedDistCm = projectedDistAu * 1495978707e4;
      const bodyDistFromSourceCm = sourceDistanceCm + projectedDistCm;
      const localBeta = shiftVelocityFn(bodyDistFromSourceCm);
      if (localBeta === 0) continue;
      const cAuPerSec = 29979245800 / 1495978707e4;
      const shiftVelocityAuS = localBeta * cAuPerSec;
      const shiftDispAu = shiftVelocityAuS * dtSec * visualExaggeration;
      state.worldPosition.addScaledVector(direction, shiftDispAu);
    }
  }
  sampleBodyStateAt(id, julianDate, memo = /* @__PURE__ */ new Map()) {
    const memoKey = `${id}:${julianDate}`;
    if (memo.has(memoKey)) {
      return memo.get(memoKey) ?? null;
    }
    const body = this.bodyById.get(id);
    if (!body) {
      return null;
    }
    const sampled2 = {
      position: new Vector3(),
      velocity: new Vector3(),
      relativePosition: new Vector3(),
      relativeVelocity: new Vector3()
    };
    if (!body.orbit) {
      sampled2.position.set(0, 0, 0);
      sampled2.velocity.set(0, 0, 0);
      sampled2.relativePosition.set(0, 0, 0);
      sampled2.relativeVelocity.set(0, 0, 0);
    } else {
      const elapsedDays = julianDate - body.orbit.epochJd;
      if (!propagateKeplerOrbit(
        body.orbit,
        elapsedDays,
        sampled2.relativePosition,
        sampled2.relativeVelocity
      )) {
        return null;
      }
      sampled2.position.copy(sampled2.relativePosition);
      sampled2.velocity.copy(sampled2.relativeVelocity);
      if (body.parentId) {
        const parent = this.sampleBodyStateAt(body.parentId, julianDate, memo);
        if (!parent) return null;
        sampled2.position.add(parent.position);
        sampled2.velocity.add(parent.velocity);
      }
    }
    memo.set(memoKey, sampled2);
    return sampled2;
  }
};

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/data/moons.json
var moons_default = [
  {
    id: 0,
    planet: "Earth",
    name: "Moon",
    iauCode: "301",
    ephemeris: "DE405/LE405",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 384400,
    e: 0.0554,
    argPeriapsisDeg: 318.15,
    meanAnomalyDeg: 135.27,
    inclinationDeg: 5.16,
    ascendingNodeDeg: 125.08,
    periodDays: 27.322,
    apsisPrecessionYears: 5.997,
    nodePrecessionYears: 18.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "n/a"
  },
  {
    id: 1,
    planet: "Mars",
    name: "Phobos",
    iauCode: "401",
    ephemeris: "MAR099",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 9375,
    e: 0.015,
    argPeriapsisDeg: 216.3,
    meanAnomalyDeg: 189.7,
    inclinationDeg: 1.1,
    ascendingNodeDeg: 169.2,
    periodDays: 0.3187,
    apsisPrecessionYears: 1.1,
    nodePrecessionYears: 2.3,
    poleRaDeg: 317.7,
    poleDecDeg: 52.9,
    poleTiltDeg: 0,
    reference: "7"
  },
  {
    id: 2,
    planet: "Mars",
    name: "Deimos",
    iauCode: "402",
    ephemeris: "MAR099",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 23457,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 205,
    inclinationDeg: 1.8,
    ascendingNodeDeg: 54.3,
    periodDays: 1.2625,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 56.2,
    poleRaDeg: 316.6,
    poleDecDeg: 53.5,
    poleTiltDeg: 0.9,
    reference: "7"
  },
  {
    id: 3,
    planet: "Jupiter",
    name: "Io",
    iauCode: "501",
    ephemeris: "JUP365",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 421800,
    e: 4e-3,
    argPeriapsisDeg: 49.1,
    meanAnomalyDeg: 330.9,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 1.762732,
    apsisPrecessionYears: 1.333,
    nodePrecessionYears: 0,
    poleRaDeg: 268.1,
    poleDecDeg: 64.5,
    poleTiltDeg: 0,
    reference: "29"
  },
  {
    id: 4,
    planet: "Jupiter",
    name: "Europa",
    iauCode: "502",
    ephemeris: "JUP365",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 671100,
    e: 9e-3,
    argPeriapsisDeg: 45,
    meanAnomalyDeg: 345.4,
    inclinationDeg: 0.5,
    ascendingNodeDeg: 184,
    periodDays: 3.525463,
    apsisPrecessionYears: 1.394,
    nodePrecessionYears: 30.202,
    poleRaDeg: 268.1,
    poleDecDeg: 64.5,
    poleTiltDeg: 0,
    reference: "29"
  },
  {
    id: 5,
    planet: "Jupiter",
    name: "Ganymede",
    iauCode: "503",
    ephemeris: "JUP365",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 1070400,
    e: 1e-3,
    argPeriapsisDeg: 198.3,
    meanAnomalyDeg: 324.8,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 58.5,
    periodDays: 7.155588,
    apsisPrecessionYears: 68.301,
    nodePrecessionYears: 137.812,
    poleRaDeg: 268.2,
    poleDecDeg: 64.6,
    poleTiltDeg: 0.1,
    reference: "29"
  },
  {
    id: 6,
    planet: "Jupiter",
    name: "Callisto",
    iauCode: "504",
    ephemeris: "JUP365",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 1882700,
    e: 7e-3,
    argPeriapsisDeg: 43.8,
    meanAnomalyDeg: 87.4,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 309.1,
    periodDays: 16.69044,
    apsisPrecessionYears: 277.921,
    nodePrecessionYears: 577.264,
    poleRaDeg: 268.7,
    poleDecDeg: 64.8,
    poleTiltDeg: 0.4,
    reference: "29"
  },
  {
    id: 7,
    planet: "Jupiter",
    name: "Amalthea",
    iauCode: "505",
    ephemeris: "JUP365",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 181400,
    e: 3e-3,
    argPeriapsisDeg: 180.1,
    meanAnomalyDeg: 310.6,
    inclinationDeg: 0.4,
    ascendingNodeDeg: 282.9,
    periodDays: 0.499918,
    apsisPrecessionYears: 0.196,
    nodePrecessionYears: 0.393,
    poleRaDeg: 268.1,
    poleDecDeg: 64.5,
    poleTiltDeg: 0,
    reference: "29"
  },
  {
    id: 8,
    planet: "Jupiter",
    name: "Thebe",
    iauCode: "514",
    ephemeris: "JUP365",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 221900,
    e: 0.018,
    argPeriapsisDeg: 26.6,
    meanAnomalyDeg: 182.1,
    inclinationDeg: 1.1,
    ascendingNodeDeg: 340.4,
    periodDays: 0.676105,
    apsisPrecessionYears: 0.398,
    nodePrecessionYears: 0.797,
    poleRaDeg: 268.1,
    poleDecDeg: 64.5,
    poleTiltDeg: 0,
    reference: "29"
  },
  {
    id: 9,
    planet: "Jupiter",
    name: "Adrastea",
    iauCode: "515",
    ephemeris: "JUP365",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 129e3,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 214.5,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.29826,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0,
    poleRaDeg: 268.1,
    poleDecDeg: 64.5,
    poleTiltDeg: 0,
    reference: "29"
  },
  {
    id: 10,
    planet: "Jupiter",
    name: "Metis",
    iauCode: "516",
    ephemeris: "JUP365",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 128e3,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 166,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.294779,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0,
    poleRaDeg: 268.1,
    poleDecDeg: 64.5,
    poleTiltDeg: 0,
    reference: "29"
  },
  {
    id: 11,
    planet: "Jupiter",
    name: "Himalia",
    iauCode: "506",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11439e3,
    e: 0.16,
    argPeriapsisDeg: 321.1,
    meanAnomalyDeg: 78.3,
    inclinationDeg: 28.4,
    ascendingNodeDeg: 64.2,
    periodDays: 249.909,
    apsisPrecessionYears: 187.4,
    nodePrecessionYears: 297.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 12,
    planet: "Jupiter",
    name: "Elara",
    iauCode: "507",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11710700,
    e: 0.212,
    argPeriapsisDeg: 129.9,
    meanAnomalyDeg: 346.9,
    inclinationDeg: 27.8,
    ascendingNodeDeg: 112.8,
    periodDays: 258.8861,
    apsisPrecessionYears: 173,
    nodePrecessionYears: 270.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 13,
    planet: "Jupiter",
    name: "Pasiphae",
    iauCode: "508",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23463200,
    e: 0.412,
    argPeriapsisDeg: 172.8,
    meanAnomalyDeg: 279.3,
    inclinationDeg: 148.3,
    ascendingNodeDeg: 315.7,
    periodDays: 734.4215,
    apsisPrecessionYears: 60.6,
    nodePrecessionYears: 79.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 14,
    planet: "Jupiter",
    name: "Sinope",
    iauCode: "509",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23679300,
    e: 0.262,
    argPeriapsisDeg: 354.3,
    meanAnomalyDeg: 157.4,
    inclinationDeg: 157.3,
    ascendingNodeDeg: 308,
    periodDays: 744.5951,
    apsisPrecessionYears: 57,
    nodePrecessionYears: 93.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 15,
    planet: "Jupiter",
    name: "Lysithea",
    iauCode: "510",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11699100,
    e: 0.117,
    argPeriapsisDeg: 48.3,
    meanAnomalyDeg: 328.5,
    inclinationDeg: 27.7,
    ascendingNodeDeg: 9.2,
    periodDays: 258.5035,
    apsisPrecessionYears: 178.9,
    nodePrecessionYears: 290.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 16,
    planet: "Jupiter",
    name: "Carme",
    iauCode: "511",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23139200,
    e: 0.261,
    argPeriapsisDeg: 6.5,
    meanAnomalyDeg: 259.5,
    inclinationDeg: 164.6,
    ascendingNodeDeg: 115.5,
    periodDays: 719.2806,
    apsisPrecessionYears: 50.9,
    nodePrecessionYears: 89,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 17,
    planet: "Jupiter",
    name: "Ananke",
    iauCode: "512",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21029500,
    e: 0.238,
    argPeriapsisDeg: 78.8,
    meanAnomalyDeg: 271.7,
    inclinationDeg: 147.6,
    ascendingNodeDeg: 13.7,
    periodDays: 623.1097,
    apsisPrecessionYears: 80.8,
    nodePrecessionYears: 115.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 18,
    planet: "Jupiter",
    name: "Leda",
    iauCode: "513",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11145200,
    e: 0.162,
    argPeriapsisDeg: 271.3,
    meanAnomalyDeg: 232.6,
    inclinationDeg: 28.2,
    ascendingNodeDeg: 216.9,
    periodDays: 240.3264,
    apsisPrecessionYears: 194.9,
    nodePrecessionYears: 309.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 19,
    planet: "Jupiter",
    name: "Callirrhoe",
    iauCode: "517",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23789400,
    e: 0.29,
    argPeriapsisDeg: 13.5,
    meanAnomalyDeg: 117.9,
    inclinationDeg: 144.9,
    ascendingNodeDeg: 278.2,
    periodDays: 749.791,
    apsisPrecessionYears: 70.3,
    nodePrecessionYears: 92.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 20,
    planet: "Jupiter",
    name: "Themisto",
    iauCode: "518",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 7397e3,
    e: 0.257,
    argPeriapsisDeg: 236.3,
    meanAnomalyDeg: 289.1,
    inclinationDeg: 44.3,
    ascendingNodeDeg: 202.7,
    periodDays: 129.9681,
    apsisPrecessionYears: 626.4,
    nodePrecessionYears: 648.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 21,
    planet: "Jupiter",
    name: "Magaclite",
    iauCode: "519",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23640100,
    e: 0.421,
    argPeriapsisDeg: 309.9,
    meanAnomalyDeg: 116.1,
    inclinationDeg: 149.9,
    ascendingNodeDeg: 292.2,
    periodDays: 742.7715,
    apsisPrecessionYears: 55.6,
    nodePrecessionYears: 74.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 22,
    planet: "Jupiter",
    name: "Taygete",
    iauCode: "520",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23103400,
    e: 0.257,
    argPeriapsisDeg: 207.7,
    meanAnomalyDeg: 116.5,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 300.8,
    periodDays: 717.5917,
    apsisPrecessionYears: 52,
    nodePrecessionYears: 91.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 23,
    planet: "Jupiter",
    name: "Chaldene",
    iauCode: "521",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22926300,
    e: 0.261,
    argPeriapsisDeg: 231.6,
    meanAnomalyDeg: 275.3,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 134.5,
    periodDays: 709.3625,
    apsisPrecessionYears: 47.3,
    nodePrecessionYears: 82.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 24,
    planet: "Jupiter",
    name: "Harpalyke",
    iauCode: "522",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20887500,
    e: 0.239,
    argPeriapsisDeg: 104.3,
    meanAnomalyDeg: 255.4,
    inclinationDeg: 147.8,
    ascendingNodeDeg: 35.6,
    periodDays: 616.7833,
    apsisPrecessionYears: 81.2,
    nodePrecessionYears: 116.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 25,
    planet: "Jupiter",
    name: "Kalyke",
    iauCode: "523",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23298e3,
    e: 0.261,
    argPeriapsisDeg: 240.5,
    meanAnomalyDeg: 224.9,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 37.7,
    periodDays: 726.7007,
    apsisPrecessionYears: 47.5,
    nodePrecessionYears: 83.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 26,
    planet: "Jupiter",
    name: "Iocaste",
    iauCode: "524",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21062300,
    e: 0.223,
    argPeriapsisDeg: 91.4,
    meanAnomalyDeg: 182,
    inclinationDeg: 148.7,
    ascendingNodeDeg: 268.9,
    periodDays: 624.5479,
    apsisPrecessionYears: 79.2,
    nodePrecessionYears: 116.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 27,
    planet: "Jupiter",
    name: "Erinome",
    iauCode: "525",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23027200,
    e: 0.272,
    argPeriapsisDeg: 359.9,
    meanAnomalyDeg: 273.1,
    inclinationDeg: 164.3,
    ascendingNodeDeg: 311.2,
    periodDays: 714.0542,
    apsisPrecessionYears: 47.5,
    nodePrecessionYears: 82.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 28,
    planet: "Jupiter",
    name: "Isonoe",
    iauCode: "526",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22976300,
    e: 0.249,
    argPeriapsisDeg: 131,
    meanAnomalyDeg: 116.3,
    inclinationDeg: 164.9,
    ascendingNodeDeg: 134.1,
    periodDays: 711.6604,
    apsisPrecessionYears: 53.2,
    nodePrecessionYears: 93.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 29,
    planet: "Jupiter",
    name: "Praxidike",
    iauCode: "527",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20931100,
    e: 0.245,
    argPeriapsisDeg: 182.5,
    meanAnomalyDeg: 128,
    inclinationDeg: 148.2,
    ascendingNodeDeg: 281.3,
    periodDays: 618.7229,
    apsisPrecessionYears: 82.5,
    nodePrecessionYears: 119.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 30,
    planet: "Jupiter",
    name: "Autonoe",
    iauCode: "528",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23785200,
    e: 0.326,
    argPeriapsisDeg: 61.2,
    meanAnomalyDeg: 134,
    inclinationDeg: 150.7,
    ascendingNodeDeg: 264.8,
    periodDays: 749.6097,
    apsisPrecessionYears: 62.8,
    nodePrecessionYears: 90.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 31,
    planet: "Jupiter",
    name: "Thyone",
    iauCode: "529",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20972700,
    e: 0.235,
    argPeriapsisDeg: 105.1,
    meanAnomalyDeg: 242.5,
    inclinationDeg: 147.6,
    ascendingNodeDeg: 240.8,
    periodDays: 620.5875,
    apsisPrecessionYears: 85.5,
    nodePrecessionYears: 122.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 32,
    planet: "Jupiter",
    name: "Hermippe",
    iauCode: "530",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21103600,
    e: 0.22,
    argPeriapsisDeg: 277.2,
    meanAnomalyDeg: 158.6,
    inclinationDeg: 150.2,
    ascendingNodeDeg: 330.3,
    periodDays: 626.3799,
    apsisPrecessionYears: 75.1,
    nodePrecessionYears: 113.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 33,
    planet: "Jupiter",
    name: "Aitne",
    iauCode: "531",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23059400,
    e: 0.273,
    argPeriapsisDeg: 72.2,
    meanAnomalyDeg: 120.6,
    inclinationDeg: 164.5,
    ascendingNodeDeg: 358.4,
    periodDays: 715.5396,
    apsisPrecessionYears: 49.8,
    nodePrecessionYears: 86.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 34,
    planet: "Jupiter",
    name: "Eurydome",
    iauCode: "532",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22894500,
    e: 0.287,
    argPeriapsisDeg: 223.4,
    meanAnomalyDeg: 281.8,
    inclinationDeg: 148.9,
    ascendingNodeDeg: 297.7,
    periodDays: 707.8569,
    apsisPrecessionYears: 66.9,
    nodePrecessionYears: 95.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 35,
    planet: "Jupiter",
    name: "Euanthe",
    iauCode: "533",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20822900,
    e: 0.243,
    argPeriapsisDeg: 312.4,
    meanAnomalyDeg: 353.5,
    inclinationDeg: 148.1,
    ascendingNodeDeg: 265.2,
    periodDays: 613.9278,
    apsisPrecessionYears: 81.1,
    nodePrecessionYears: 116.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 36,
    planet: "Jupiter",
    name: "Euporie",
    iauCode: "534",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19261900,
    e: 0.148,
    argPeriapsisDeg: 109.5,
    meanAnomalyDeg: 56.4,
    inclinationDeg: 145.5,
    ascendingNodeDeg: 63.4,
    periodDays: 546.1778,
    apsisPrecessionYears: 101,
    nodePrecessionYears: 143.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 37,
    planet: "Jupiter",
    name: "Orthosie",
    iauCode: "535",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20897800,
    e: 0.294,
    argPeriapsisDeg: 244.7,
    meanAnomalyDeg: 161.1,
    inclinationDeg: 144.2,
    ascendingNodeDeg: 212.4,
    periodDays: 617.2347,
    apsisPrecessionYears: 89.5,
    nodePrecessionYears: 116.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 38,
    planet: "Jupiter",
    name: "Sponde",
    iauCode: "536",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23538700,
    e: 0.323,
    argPeriapsisDeg: 56.6,
    meanAnomalyDeg: 177.4,
    inclinationDeg: 149.4,
    ascendingNodeDeg: 109.3,
    periodDays: 737.9542,
    apsisPrecessionYears: 58.7,
    nodePrecessionYears: 82.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 39,
    planet: "Jupiter",
    name: "Kale",
    iauCode: "537",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23047800,
    e: 0.262,
    argPeriapsisDeg: 69.2,
    meanAnomalyDeg: 175.9,
    inclinationDeg: 164.6,
    ascendingNodeDeg: 56.7,
    periodDays: 715.016,
    apsisPrecessionYears: 49.1,
    nodePrecessionYears: 85.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 40,
    planet: "Jupiter",
    name: "Pasithee",
    iauCode: "538",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22840800,
    e: 0.274,
    argPeriapsisDeg: 207.9,
    meanAnomalyDeg: 237.8,
    inclinationDeg: 164.5,
    ascendingNodeDeg: 318,
    periodDays: 705.409,
    apsisPrecessionYears: 52.6,
    nodePrecessionYears: 91.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 41,
    planet: "Jupiter",
    name: "Hegemone",
    iauCode: "539",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23342600,
    e: 0.357,
    argPeriapsisDeg: 192.2,
    meanAnomalyDeg: 241.1,
    inclinationDeg: 152.5,
    ascendingNodeDeg: 311.5,
    periodDays: 728.7743,
    apsisPrecessionYears: 53.9,
    nodePrecessionYears: 78,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 42,
    planet: "Jupiter",
    name: "Mneme",
    iauCode: "540",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20815800,
    e: 0.24,
    argPeriapsisDeg: 50.1,
    meanAnomalyDeg: 236.1,
    inclinationDeg: 147.8,
    ascendingNodeDeg: 0.9,
    periodDays: 613.6104,
    apsisPrecessionYears: 80.1,
    nodePrecessionYears: 114.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 43,
    planet: "Jupiter",
    name: "Aoede",
    iauCode: "541",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23773100,
    e: 0.437,
    argPeriapsisDeg: 43.1,
    meanAnomalyDeg: 207.6,
    inclinationDeg: 155.7,
    ascendingNodeDeg: 156.5,
    periodDays: 749.0708,
    apsisPrecessionYears: 52.6,
    nodePrecessionYears: 75,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 44,
    planet: "Jupiter",
    name: "Thelxinoe",
    iauCode: "542",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20972300,
    e: 0.229,
    argPeriapsisDeg: 307,
    meanAnomalyDeg: 275.1,
    inclinationDeg: 150.7,
    ascendingNodeDeg: 174.9,
    periodDays: 620.5458,
    apsisPrecessionYears: 73.6,
    nodePrecessionYears: 111.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 45,
    planet: "Jupiter",
    name: "Arche",
    iauCode: "543",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23093200,
    e: 0.263,
    argPeriapsisDeg: 172.5,
    meanAnomalyDeg: 34,
    inclinationDeg: 164.5,
    ascendingNodeDeg: 333.3,
    periodDays: 717.1056,
    apsisPrecessionYears: 51,
    nodePrecessionYears: 89,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 46,
    planet: "Jupiter",
    name: "Kallichore",
    iauCode: "544",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23017100,
    e: 0.253,
    argPeriapsisDeg: 352.6,
    meanAnomalyDeg: 66.8,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 23.9,
    periodDays: 713.5931,
    apsisPrecessionYears: 49.1,
    nodePrecessionYears: 86.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 47,
    planet: "Jupiter",
    name: "Helike",
    iauCode: "545",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20911400,
    e: 0.155,
    argPeriapsisDeg: 305.1,
    meanAnomalyDeg: 45.8,
    inclinationDeg: 154.4,
    ascendingNodeDeg: 94.6,
    periodDays: 617.8625,
    apsisPrecessionYears: 73.5,
    nodePrecessionYears: 121.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 48,
    planet: "Jupiter",
    name: "Carpo",
    iauCode: "546",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17039500,
    e: 0.415,
    argPeriapsisDeg: 90.5,
    meanAnomalyDeg: 336.6,
    inclinationDeg: 53.3,
    ascendingNodeDeg: 52.1,
    periodDays: 454.4,
    apsisPrecessionYears: 285.1,
    nodePrecessionYears: 182,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 49,
    planet: "Jupiter",
    name: "Eukelade",
    iauCode: "547",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23062400,
    e: 0.274,
    argPeriapsisDeg: 290.1,
    meanAnomalyDeg: 234.2,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 200.4,
    periodDays: 715.6868,
    apsisPrecessionYears: 48.5,
    nodePrecessionYears: 84.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 50,
    planet: "Jupiter",
    name: "Cyllene",
    iauCode: "548",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 2365e4,
    e: 0.421,
    argPeriapsisDeg: 174.6,
    meanAnomalyDeg: 153.3,
    inclinationDeg: 146.8,
    ascendingNodeDeg: 253.6,
    periodDays: 743.2062,
    apsisPrecessionYears: 65.9,
    nodePrecessionYears: 83.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 51,
    planet: "Jupiter",
    name: "Kore",
    iauCode: "549",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 24203300,
    e: 0.338,
    argPeriapsisDeg: 135.3,
    meanAnomalyDeg: 40.6,
    inclinationDeg: 141.7,
    ascendingNodeDeg: 324.2,
    periodDays: 769.4229,
    apsisPrecessionYears: 71.7,
    nodePrecessionYears: 85.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 52,
    planet: "Jupiter",
    name: "Herse",
    iauCode: "550",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23146700,
    e: 0.258,
    argPeriapsisDeg: 344.1,
    meanAnomalyDeg: 123.1,
    inclinationDeg: 164.4,
    ascendingNodeDeg: 299.5,
    periodDays: 719.6264,
    apsisPrecessionYears: 50.9,
    nodePrecessionYears: 88.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 53,
    planet: "Jupiter",
    name: "S2010_J_1",
    iauCode: "551",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23185600,
    e: 0.256,
    argPeriapsisDeg: 175.6,
    meanAnomalyDeg: 183.4,
    inclinationDeg: 164.5,
    ascendingNodeDeg: 284.7,
    periodDays: 721.4257,
    apsisPrecessionYears: 51,
    nodePrecessionYears: 89.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 54,
    planet: "Jupiter",
    name: "S2010_J_2",
    iauCode: "552",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20786900,
    e: 0.244,
    argPeriapsisDeg: 28.8,
    meanAnomalyDeg: 292.5,
    inclinationDeg: 148,
    ascendingNodeDeg: 357.3,
    periodDays: 612.3507,
    apsisPrecessionYears: 80.5,
    nodePrecessionYears: 115.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 55,
    planet: "Jupiter",
    name: "Dia",
    iauCode: "553",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 12257900,
    e: 0.232,
    argPeriapsisDeg: 164.1,
    meanAnomalyDeg: 320.9,
    inclinationDeg: 29.1,
    ascendingNodeDeg: 293.9,
    periodDays: 277.2472,
    apsisPrecessionYears: 169.8,
    nodePrecessionYears: 258.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 56,
    planet: "Jupiter",
    name: "S2016_J_1",
    iauCode: "554",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20796700,
    e: 0.245,
    argPeriapsisDeg: 298.5,
    meanAnomalyDeg: 215.3,
    inclinationDeg: 145.1,
    ascendingNodeDeg: 247.7,
    periodDays: 612.7812,
    apsisPrecessionYears: 92.6,
    nodePrecessionYears: 125.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 57,
    planet: "Jupiter",
    name: "S2003_J_18",
    iauCode: "555",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20332800,
    e: 0.102,
    argPeriapsisDeg: 86.2,
    meanAnomalyDeg: 252.5,
    inclinationDeg: 145.7,
    ascendingNodeDeg: 166.8,
    periodDays: 592.3333,
    apsisPrecessionYears: 91.2,
    nodePrecessionYears: 131.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 58,
    planet: "Jupiter",
    name: "S2011_J_2",
    iauCode: "556",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22903400,
    e: 0.358,
    argPeriapsisDeg: 262.9,
    meanAnomalyDeg: 297.6,
    inclinationDeg: 151.7,
    ascendingNodeDeg: 24.9,
    periodDays: 708.2931,
    apsisPrecessionYears: 59,
    nodePrecessionYears: 84.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 59,
    planet: "Jupiter",
    name: "Eirene",
    iauCode: "557",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23051300,
    e: 0.263,
    argPeriapsisDeg: 86.4,
    meanAnomalyDeg: 336.7,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 180,
    periodDays: 715.191,
    apsisPrecessionYears: 50.7,
    nodePrecessionYears: 88.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 60,
    planet: "Jupiter",
    name: "Philophrosyn",
    iauCode: "558",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22600200,
    e: 0.221,
    argPeriapsisDeg: 0.9,
    meanAnomalyDeg: 88.9,
    inclinationDeg: 146.1,
    ascendingNodeDeg: 234.3,
    periodDays: 694.2042,
    apsisPrecessionYears: 75.6,
    nodePrecessionYears: 105.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 61,
    planet: "Jupiter",
    name: "S2017_J_1",
    iauCode: "559",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23739600,
    e: 0.321,
    argPeriapsisDeg: 74.7,
    meanAnomalyDeg: 250.1,
    inclinationDeg: 145.6,
    ascendingNodeDeg: 251.8,
    periodDays: 747.4382,
    apsisPrecessionYears: 72.8,
    nodePrecessionYears: 95.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 62,
    planet: "Jupiter",
    name: "Eupheme",
    iauCode: "560",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20763400,
    e: 0.234,
    argPeriapsisDeg: 73.6,
    meanAnomalyDeg: 339.8,
    inclinationDeg: 147.9,
    ascendingNodeDeg: 227.5,
    periodDays: 611.316,
    apsisPrecessionYears: 85.3,
    nodePrecessionYears: 122.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 63,
    planet: "Jupiter",
    name: "S2003_J_19",
    iauCode: "561",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23153100,
    e: 0.264,
    argPeriapsisDeg: 186.8,
    meanAnomalyDeg: 196.9,
    inclinationDeg: 164.6,
    ascendingNodeDeg: 21.9,
    periodDays: 719.9222,
    apsisPrecessionYears: 51.6,
    nodePrecessionYears: 90.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 64,
    planet: "Jupiter",
    name: "Valetudo",
    iauCode: "562",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18690100,
    e: 0.217,
    argPeriapsisDeg: 316.3,
    meanAnomalyDeg: 90.5,
    inclinationDeg: 34.5,
    ascendingNodeDeg: 291.2,
    periodDays: 522.0743,
    apsisPrecessionYears: 106.3,
    nodePrecessionYears: 147.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 65,
    planet: "Jupiter",
    name: "S2017_J_2",
    iauCode: "563",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22949600,
    e: 0.27,
    argPeriapsisDeg: 153,
    meanAnomalyDeg: 278.2,
    inclinationDeg: 164.5,
    ascendingNodeDeg: 359.4,
    periodDays: 710.4208,
    apsisPrecessionYears: 46.7,
    nodePrecessionYears: 81,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 66,
    planet: "Jupiter",
    name: "S2017_J_3",
    iauCode: "564",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20936500,
    e: 0.238,
    argPeriapsisDeg: 105.7,
    meanAnomalyDeg: 235.4,
    inclinationDeg: 147.9,
    ascendingNodeDeg: 27.9,
    periodDays: 618.9653,
    apsisPrecessionYears: 77,
    nodePrecessionYears: 110.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 67,
    planet: "Jupiter",
    name: "Pandia",
    iauCode: "565",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11479600,
    e: 0.178,
    argPeriapsisDeg: 188.7,
    meanAnomalyDeg: 158.5,
    inclinationDeg: 28.9,
    ascendingNodeDeg: 249.8,
    periodDays: 251.2319,
    apsisPrecessionYears: 187.8,
    nodePrecessionYears: 293.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 68,
    planet: "Jupiter",
    name: "S2017_J_5",
    iauCode: "566",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23202e3,
    e: 0.261,
    argPeriapsisDeg: 292.5,
    meanAnomalyDeg: 69.3,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 42.3,
    periodDays: 722.1972,
    apsisPrecessionYears: 47.7,
    nodePrecessionYears: 83.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 69,
    planet: "Jupiter",
    name: "S2017_J_6",
    iauCode: "567",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23251200,
    e: 0.333,
    argPeriapsisDeg: 15.5,
    meanAnomalyDeg: 146,
    inclinationDeg: 149.6,
    ascendingNodeDeg: 312.8,
    periodDays: 724.4688,
    apsisPrecessionYears: 62.4,
    nodePrecessionYears: 87.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 70,
    planet: "Jupiter",
    name: "S2017_J_7",
    iauCode: "568",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20960400,
    e: 0.235,
    argPeriapsisDeg: 288.7,
    meanAnomalyDeg: 353,
    inclinationDeg: 147.4,
    ascendingNodeDeg: 264.9,
    periodDays: 620.0167,
    apsisPrecessionYears: 81.2,
    nodePrecessionYears: 115.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 71,
    planet: "Jupiter",
    name: "S2017_J_8",
    iauCode: "569",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22819600,
    e: 0.259,
    argPeriapsisDeg: 330.5,
    meanAnomalyDeg: 349.4,
    inclinationDeg: 164.8,
    ascendingNodeDeg: 97.3,
    periodDays: 704.4181,
    apsisPrecessionYears: 53.9,
    nodePrecessionYears: 94.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 72,
    planet: "Jupiter",
    name: "S2017_J_9",
    iauCode: "570",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21764200,
    e: 0.197,
    argPeriapsisDeg: 276.4,
    meanAnomalyDeg: 243.3,
    inclinationDeg: 155.4,
    ascendingNodeDeg: 245.3,
    periodDays: 656.0479,
    apsisPrecessionYears: 64.5,
    nodePrecessionYears: 106.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 73,
    planet: "Jupiter",
    name: "Ersa",
    iauCode: "571",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11399400,
    e: 0.117,
    argPeriapsisDeg: 300.7,
    meanAnomalyDeg: 270.8,
    inclinationDeg: 29,
    ascendingNodeDeg: 113.7,
    periodDays: 248.6153,
    apsisPrecessionYears: 192.6,
    nodePrecessionYears: 306.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 74,
    planet: "Jupiter",
    name: "S2011_J_1",
    iauCode: "572",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23120800,
    e: 0.269,
    argPeriapsisDeg: 50.4,
    meanAnomalyDeg: 225.4,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 253.5,
    periodDays: 718.4153,
    apsisPrecessionYears: 51.7,
    nodePrecessionYears: 90.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 75,
    planet: "Jupiter",
    name: "S2003_J_2",
    iauCode: "55501",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20992900,
    e: 0.225,
    argPeriapsisDeg: 170.6,
    meanAnomalyDeg: 42.3,
    inclinationDeg: 150.1,
    ascendingNodeDeg: 348.4,
    periodDays: 621.4715,
    apsisPrecessionYears: 79.3,
    nodePrecessionYears: 119.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 76,
    planet: "Jupiter",
    name: "S2003_J_4",
    iauCode: "55502",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22922300,
    e: 0.327,
    argPeriapsisDeg: 208.8,
    meanAnomalyDeg: 216.5,
    inclinationDeg: 148.3,
    ascendingNodeDeg: 175.4,
    periodDays: 709.1229,
    apsisPrecessionYears: 69.2,
    nodePrecessionYears: 95.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 77,
    planet: "Jupiter",
    name: "S2003_J_9",
    iauCode: "55503",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23195100,
    e: 0.268,
    argPeriapsisDeg: 288.4,
    meanAnomalyDeg: 359.8,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 46.3,
    periodDays: 721.8792,
    apsisPrecessionYears: 51.2,
    nodePrecessionYears: 89.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 78,
    planet: "Jupiter",
    name: "S2003_J_10",
    iauCode: "55504",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23384400,
    e: 0.257,
    argPeriapsisDeg: 187.6,
    meanAnomalyDeg: 272.8,
    inclinationDeg: 164.6,
    ascendingNodeDeg: 155.7,
    periodDays: 730.7375,
    apsisPrecessionYears: 51,
    nodePrecessionYears: 89.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 79,
    planet: "Jupiter",
    name: "S2003_J_12",
    iauCode: "55505",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20959300,
    e: 0.235,
    argPeriapsisDeg: 66.1,
    meanAnomalyDeg: 160.7,
    inclinationDeg: 150,
    ascendingNodeDeg: 54.1,
    periodDays: 619.9611,
    apsisPrecessionYears: 73.3,
    nodePrecessionYears: 109.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 80,
    planet: "Jupiter",
    name: "S2003_J_16",
    iauCode: "55506",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20877500,
    e: 0.238,
    argPeriapsisDeg: 55.6,
    meanAnomalyDeg: 298.2,
    inclinationDeg: 147.8,
    ascendingNodeDeg: 5.3,
    periodDays: 616.3444,
    apsisPrecessionYears: 83.7,
    nodePrecessionYears: 120.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 81,
    planet: "Jupiter",
    name: "S2003_J_23",
    iauCode: "55507",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23824e3,
    e: 0.306,
    argPeriapsisDeg: 256.6,
    meanAnomalyDeg: 140.6,
    inclinationDeg: 144.4,
    ascendingNodeDeg: 30.9,
    periodDays: 751.3993,
    apsisPrecessionYears: 75.8,
    nodePrecessionYears: 98.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 82,
    planet: "Jupiter",
    name: "S2003_J_24",
    iauCode: "55508",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22882400,
    e: 0.263,
    argPeriapsisDeg: 84.1,
    meanAnomalyDeg: 121.6,
    inclinationDeg: 164.6,
    ascendingNodeDeg: 208.7,
    periodDays: 707.3347,
    apsisPrecessionYears: 53.4,
    nodePrecessionYears: 93.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 83,
    planet: "Jupiter",
    name: "S2011_J_3",
    iauCode: "55509",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11716800,
    e: 0.192,
    argPeriapsisDeg: 134.7,
    meanAnomalyDeg: 359.4,
    inclinationDeg: 27.6,
    ascendingNodeDeg: 123.3,
    periodDays: 259.0875,
    apsisPrecessionYears: 174.2,
    nodePrecessionYears: 275.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 84,
    planet: "Jupiter",
    name: "S2018_J_2",
    iauCode: "55510",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11419700,
    e: 0.152,
    argPeriapsisDeg: 288.6,
    meanAnomalyDeg: 115.5,
    inclinationDeg: 28.3,
    ascendingNodeDeg: 91.8,
    periodDays: 249.275,
    apsisPrecessionYears: 187.8,
    nodePrecessionYears: 298.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 85,
    planet: "Jupiter",
    name: "S2018_J_3",
    iauCode: "55511",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23400200,
    e: 0.268,
    argPeriapsisDeg: 177.5,
    meanAnomalyDeg: 279,
    inclinationDeg: 164.9,
    ascendingNodeDeg: 135.7,
    periodDays: 731.4875,
    apsisPrecessionYears: 50.1,
    nodePrecessionYears: 87.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 86,
    planet: "Jupiter",
    name: "S2021_J_1",
    iauCode: "55512",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20954700,
    e: 0.228,
    argPeriapsisDeg: 20.6,
    meanAnomalyDeg: 129.1,
    inclinationDeg: 150.5,
    ascendingNodeDeg: 241.1,
    periodDays: 619.7687,
    apsisPrecessionYears: 78.1,
    nodePrecessionYears: 118.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 87,
    planet: "Jupiter",
    name: "S2021_J_2",
    iauCode: "55513",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20926600,
    e: 0.242,
    argPeriapsisDeg: 25.9,
    meanAnomalyDeg: 110.8,
    inclinationDeg: 148.1,
    ascendingNodeDeg: 269.5,
    periodDays: 618.5028,
    apsisPrecessionYears: 79.2,
    nodePrecessionYears: 114.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 88,
    planet: "Jupiter",
    name: "S2021_J_3",
    iauCode: "55514",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20776600,
    e: 0.239,
    argPeriapsisDeg: 218.6,
    meanAnomalyDeg: 167.9,
    inclinationDeg: 147.9,
    ascendingNodeDeg: 141.7,
    periodDays: 611.8736,
    apsisPrecessionYears: 84,
    nodePrecessionYears: 120.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 89,
    planet: "Jupiter",
    name: "S2021_J_4",
    iauCode: "55515",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23019700,
    e: 0.265,
    argPeriapsisDeg: 140.5,
    meanAnomalyDeg: 218.9,
    inclinationDeg: 164.6,
    ascendingNodeDeg: 129.9,
    periodDays: 713.7056,
    apsisPrecessionYears: 51.5,
    nodePrecessionYears: 89.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 90,
    planet: "Jupiter",
    name: "S2021_J_5",
    iauCode: "55516",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23414600,
    e: 0.272,
    argPeriapsisDeg: 273.4,
    meanAnomalyDeg: 236.5,
    inclinationDeg: 164.9,
    ascendingNodeDeg: 154.4,
    periodDays: 732.1528,
    apsisPrecessionYears: 50.6,
    nodePrecessionYears: 88.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 91,
    planet: "Jupiter",
    name: "S2021_J_6",
    iauCode: "55517",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22870400,
    e: 0.271,
    argPeriapsisDeg: 146.2,
    meanAnomalyDeg: 208.5,
    inclinationDeg: 164.9,
    ascendingNodeDeg: 87.2,
    periodDays: 706.7653,
    apsisPrecessionYears: 46.9,
    nodePrecessionYears: 81.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 92,
    planet: "Jupiter",
    name: "S2016_J_3",
    iauCode: "55518",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22719300,
    e: 0.251,
    argPeriapsisDeg: 94.7,
    meanAnomalyDeg: 59.1,
    inclinationDeg: 164.6,
    ascendingNodeDeg: 36.8,
    periodDays: 699.7583,
    apsisPrecessionYears: 53.4,
    nodePrecessionYears: 93.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 93,
    planet: "Jupiter",
    name: "S2016_J_4",
    iauCode: "55519",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23113900,
    e: 0.294,
    argPeriapsisDeg: 249.4,
    meanAnomalyDeg: 217.5,
    inclinationDeg: 147.1,
    ascendingNodeDeg: 203.2,
    periodDays: 718.0382,
    apsisPrecessionYears: 68.6,
    nodePrecessionYears: 94.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 94,
    planet: "Jupiter",
    name: "S2018_J_4",
    iauCode: "55520",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16328500,
    e: 0.177,
    argPeriapsisDeg: 285,
    meanAnomalyDeg: 138.3,
    inclinationDeg: 50.2,
    ascendingNodeDeg: 52.1,
    periodDays: 426.2646,
    apsisPrecessionYears: 297.2,
    nodePrecessionYears: 239.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 95,
    planet: "Jupiter",
    name: "S2022_J_1",
    iauCode: "55521",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22744700,
    e: 0.257,
    argPeriapsisDeg: 232.4,
    meanAnomalyDeg: 42.2,
    inclinationDeg: 164.5,
    ascendingNodeDeg: 310.9,
    periodDays: 700.9333,
    apsisPrecessionYears: 50.2,
    nodePrecessionYears: 87.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 96,
    planet: "Jupiter",
    name: "S2022_J_2",
    iauCode: "55522",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23073400,
    e: 0.263,
    argPeriapsisDeg: 357,
    meanAnomalyDeg: 98.9,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 47.7,
    periodDays: 716.2104,
    apsisPrecessionYears: 48.3,
    nodePrecessionYears: 84.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 97,
    planet: "Jupiter",
    name: "S2022_J_3",
    iauCode: "55523",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21015100,
    e: 0.248,
    argPeriapsisDeg: 351.6,
    meanAnomalyDeg: 271.7,
    inclinationDeg: 148.1,
    ascendingNodeDeg: 233.1,
    periodDays: 622.4361,
    apsisPrecessionYears: 83.4,
    nodePrecessionYears: 119.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 98,
    planet: "Jupiter",
    name: "S2017_J_10",
    iauCode: "55525",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21075800,
    e: 0.209,
    argPeriapsisDeg: 195.3,
    meanAnomalyDeg: 157.7,
    inclinationDeg: 145.1,
    ascendingNodeDeg: 329.6,
    periodDays: 625.1493,
    apsisPrecessionYears: 91.1,
    nodePrecessionYears: 125.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 99,
    planet: "Jupiter",
    name: "S2017_J_11",
    iauCode: "55526",
    ephemeris: "JUP347",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22991300,
    e: 0.268,
    argPeriapsisDeg: 25.5,
    meanAnomalyDeg: 236.9,
    inclinationDeg: 164.8,
    ascendingNodeDeg: 134.9,
    periodDays: 712.3826,
    apsisPrecessionYears: 52.3,
    nodePrecessionYears: 91.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "47"
  },
  {
    id: 100,
    planet: "Saturn",
    name: "Mimas",
    iauCode: "601",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 186e3,
    e: 0.02,
    argPeriapsisDeg: 160.4,
    meanAnomalyDeg: 275.3,
    inclinationDeg: 1.6,
    ascendingNodeDeg: 66.2,
    periodDays: 0.942422,
    apsisPrecessionYears: 0.493,
    nodePrecessionYears: 0.986,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 101,
    planet: "Saturn",
    name: "Enceladus",
    iauCode: "602",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 238400,
    e: 5e-3,
    argPeriapsisDeg: 119.5,
    meanAnomalyDeg: 57,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 1.370218,
    apsisPrecessionYears: 2.916,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 102,
    planet: "Saturn",
    name: "Tethys",
    iauCode: "603",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 295e3,
    e: 1e-3,
    argPeriapsisDeg: 335.3,
    meanAnomalyDeg: 0,
    inclinationDeg: 1.1,
    ascendingNodeDeg: 273,
    periodDays: 1.887802,
    apsisPrecessionYears: 5e-3,
    nodePrecessionYears: 4.982,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 103,
    planet: "Saturn",
    name: "Dione",
    iauCode: "604",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 377700,
    e: 2e-3,
    argPeriapsisDeg: 116,
    meanAnomalyDeg: 212,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 2.736916,
    apsisPrecessionYears: 11.698,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 104,
    planet: "Saturn",
    name: "Rhea",
    iauCode: "605",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 527200,
    e: 1e-3,
    argPeriapsisDeg: 44.3,
    meanAnomalyDeg: 31.5,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 133.7,
    periodDays: 4.517503,
    apsisPrecessionYears: 33.939,
    nodePrecessionYears: 35.775,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 105,
    planet: "Saturn",
    name: "Titan",
    iauCode: "606",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 1221900,
    e: 0.029,
    argPeriapsisDeg: 78.3,
    meanAnomalyDeg: 11.7,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 78.6,
    periodDays: 15.945448,
    apsisPrecessionYears: 346.68,
    nodePrecessionYears: 687.37,
    poleRaDeg: 36.4,
    poleDecDeg: 84,
    poleTiltDeg: 0.6,
    reference: "36"
  },
  {
    id: 106,
    planet: "Saturn",
    name: "Hyperion",
    iauCode: "607",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 1481500,
    e: 0.105,
    argPeriapsisDeg: 214,
    meanAnomalyDeg: 122.9,
    inclinationDeg: 0.6,
    ascendingNodeDeg: 87.1,
    periodDays: 21.276658,
    apsisPrecessionYears: 20.843,
    nodePrecessionYears: 257.625,
    poleRaDeg: 40.2,
    poleDecDeg: 83.6,
    poleTiltDeg: 0.1,
    reference: "36"
  },
  {
    id: 107,
    planet: "Saturn",
    name: "Iapetus",
    iauCode: "608",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 3561700,
    e: 0.028,
    argPeriapsisDeg: 254.5,
    meanAnomalyDeg: 74.8,
    inclinationDeg: 7.6,
    ascendingNodeDeg: 86.5,
    periodDays: 79.331002,
    apsisPrecessionYears: 1662.9,
    nodePrecessionYears: 3130.302,
    poleRaDeg: 288.7,
    poleDecDeg: 78.9,
    poleTiltDeg: 14.8,
    reference: "36"
  },
  {
    id: 108,
    planet: "Saturn",
    name: "Phoebe",
    iauCode: "609",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 12929400,
    e: 0.164,
    argPeriapsisDeg: 240.3,
    meanAnomalyDeg: 308,
    inclinationDeg: 175.2,
    ascendingNodeDeg: 192.7,
    periodDays: 550.30391,
    apsisPrecessionYears: 468.321,
    nodePrecessionYears: 741.483,
    poleRaDeg: 276,
    poleDecDeg: 67.5,
    poleTiltDeg: 26.7,
    reference: "36"
  },
  {
    id: 109,
    planet: "Saturn",
    name: "Helene",
    iauCode: "612",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 377600,
    e: 7e-3,
    argPeriapsisDeg: 194.3,
    meanAnomalyDeg: -64.5,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 260.8,
    periodDays: 2.736916,
    apsisPrecessionYears: 5.825,
    nodePrecessionYears: 11.707,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 110,
    planet: "Saturn",
    name: "Telesto",
    iauCode: "613",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 295e3,
    e: 1e-3,
    argPeriapsisDeg: 66.2,
    meanAnomalyDeg: 360,
    inclinationDeg: 1.2,
    ascendingNodeDeg: 242.1,
    periodDays: 1.887802,
    apsisPrecessionYears: 5e-3,
    nodePrecessionYears: 4.982,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 111,
    planet: "Saturn",
    name: "Calypso",
    iauCode: "614",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 295e3,
    e: 1e-3,
    argPeriapsisDeg: 221.6,
    meanAnomalyDeg: 0,
    inclinationDeg: 1.5,
    ascendingNodeDeg: 326.6,
    periodDays: 1.887803,
    apsisPrecessionYears: 5e-3,
    nodePrecessionYears: 4.983,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 112,
    planet: "Saturn",
    name: "Methone",
    iauCode: "632",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 194700,
    e: 2e-3,
    argPeriapsisDeg: 315.5,
    meanAnomalyDeg: 0,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 1.009549,
    apsisPrecessionYears: 3e-3,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 113,
    planet: "Saturn",
    name: "Polydeuces",
    iauCode: "634",
    ephemeris: "SAT441",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 377600,
    e: 0.019,
    argPeriapsisDeg: 94.1,
    meanAnomalyDeg: 359,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 167.5,
    periodDays: 2.736916,
    apsisPrecessionYears: 5.81,
    nodePrecessionYears: 11.692,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "36"
  },
  {
    id: 114,
    planet: "Saturn",
    name: "Janus",
    iauCode: "610",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 151500,
    e: 7e-3,
    argPeriapsisDeg: 11.1,
    meanAnomalyDeg: 111.7,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 159.9,
    periodDays: 0.697353,
    apsisPrecessionYears: 0.24,
    nodePrecessionYears: 0.482,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 115,
    planet: "Saturn",
    name: "Epimetheus",
    iauCode: "611",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 151400,
    e: 0.02,
    argPeriapsisDeg: 96.3,
    meanAnomalyDeg: 197.2,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 189.8,
    periodDays: 0.697012,
    apsisPrecessionYears: 0.24,
    nodePrecessionYears: 0.482,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 116,
    planet: "Saturn",
    name: "Atlas",
    iauCode: "615",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 137700,
    e: 1e-3,
    argPeriapsisDeg: 82.3,
    meanAnomalyDeg: 289.1,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.604602,
    apsisPrecessionYears: 0.342,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 117,
    planet: "Saturn",
    name: "Prometheus",
    iauCode: "616",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 139400,
    e: 2e-3,
    argPeriapsisDeg: 341.9,
    meanAnomalyDeg: 135.4,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.615878,
    apsisPrecessionYears: 0.357,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 118,
    planet: "Saturn",
    name: "Pandora",
    iauCode: "617",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 141700,
    e: 4e-3,
    argPeriapsisDeg: 217.9,
    meanAnomalyDeg: 123.9,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.631369,
    apsisPrecessionYears: 0.379,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 119,
    planet: "Saturn",
    name: "Pan",
    iauCode: "618",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 133600,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 146.6,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.575051,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 120,
    planet: "Saturn",
    name: "Pallene",
    iauCode: "633",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 212300,
    e: 4e-3,
    argPeriapsisDeg: 194.9,
    meanAnomalyDeg: 2,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 304.3,
    periodDays: 1.156059,
    apsisPrecessionYears: 0.79,
    nodePrecessionYears: 1.582,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 121,
    planet: "Saturn",
    name: "Daphnis",
    iauCode: "635",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 136500,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 153.6,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.59408,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 122,
    planet: "Saturn",
    name: "Anthe",
    iauCode: "649",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 198100,
    e: 2e-3,
    argPeriapsisDeg: 293.4,
    meanAnomalyDeg: 351.4,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 1.038898,
    apsisPrecessionYears: 1.19,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 123,
    planet: "Saturn",
    name: "Aegaeon",
    iauCode: "653",
    ephemeris: "SAT415",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 167500,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 4.4,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.808115,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    poleTiltDeg: 0,
    reference: "17"
  },
  {
    id: 124,
    planet: "Saturn",
    name: "Ymir",
    iauCode: "619",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22955600,
    e: 0.338,
    argPeriapsisDeg: 45.3,
    meanAnomalyDeg: 167.5,
    inclinationDeg: 172.3,
    ascendingNodeDeg: 204.5,
    periodDays: 1298.6819,
    apsisPrecessionYears: 154.5,
    nodePrecessionYears: 267.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 125,
    planet: "Saturn",
    name: "Paaliaq",
    iauCode: "620",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 14997700,
    e: 0.378,
    argPeriapsisDeg: 237.6,
    meanAnomalyDeg: 318.2,
    inclinationDeg: 48.5,
    ascendingNodeDeg: 353.2,
    periodDays: 685.7153,
    apsisPrecessionYears: 846.2,
    nodePrecessionYears: 704.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 126,
    planet: "Saturn",
    name: "Tarvos",
    iauCode: "621",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18216600,
    e: 0.522,
    argPeriapsisDeg: 282.9,
    meanAnomalyDeg: 64.5,
    inclinationDeg: 37.8,
    ascendingNodeDeg: 95.7,
    periodDays: 917.984,
    apsisPrecessionYears: 327.3,
    nodePrecessionYears: 352,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 127,
    planet: "Saturn",
    name: "Ijiraq",
    iauCode: "622",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11344700,
    e: 0.293,
    argPeriapsisDeg: 68.6,
    meanAnomalyDeg: 83.4,
    inclinationDeg: 49.2,
    ascendingNodeDeg: 152.5,
    periodDays: 451.1201,
    apsisPrecessionYears: 1480.8,
    nodePrecessionYears: 1223,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 128,
    planet: "Saturn",
    name: "Suttungr",
    iauCode: "623",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19391900,
    e: 0.116,
    argPeriapsisDeg: 65,
    meanAnomalyDeg: 171,
    inclinationDeg: 175.7,
    ascendingNodeDeg: 253.2,
    periodDays: 1008.2451,
    apsisPrecessionYears: 205,
    nodePrecessionYears: 401.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 129,
    planet: "Saturn",
    name: "Kiviuq",
    iauCode: "624",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11307400,
    e: 0.275,
    argPeriapsisDeg: 91.8,
    meanAnomalyDeg: 183.2,
    inclinationDeg: 48,
    ascendingNodeDeg: 352.7,
    periodDays: 448.9076,
    apsisPrecessionYears: 1376.4,
    nodePrecessionYears: 1214.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 130,
    planet: "Saturn",
    name: "Mundilfari",
    iauCode: "625",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18588200,
    e: 0.211,
    argPeriapsisDeg: 305.4,
    meanAnomalyDeg: 299,
    inclinationDeg: 167.1,
    ascendingNodeDeg: 79.2,
    periodDays: 946.2903,
    apsisPrecessionYears: 227,
    nodePrecessionYears: 414.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 131,
    planet: "Saturn",
    name: "Albiorix",
    iauCode: "626",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16329200,
    e: 0.482,
    argPeriapsisDeg: 62.8,
    meanAnomalyDeg: 155,
    inclinationDeg: 36.8,
    ascendingNodeDeg: 111.1,
    periodDays: 779.0701,
    apsisPrecessionYears: 384.4,
    nodePrecessionYears: 434.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 132,
    planet: "Saturn",
    name: "Skathi",
    iauCode: "627",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 15575400,
    e: 0.281,
    argPeriapsisDeg: 202.3,
    meanAnomalyDeg: 269.3,
    inclinationDeg: 151.6,
    ascendingNodeDeg: 284.1,
    periodDays: 725.7313,
    apsisPrecessionYears: 374.9,
    nodePrecessionYears: 561.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 133,
    planet: "Saturn",
    name: "Erriapus",
    iauCode: "628",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17506900,
    e: 0.475,
    argPeriapsisDeg: 279.8,
    meanAnomalyDeg: 14.3,
    inclinationDeg: 37.1,
    ascendingNodeDeg: 146.2,
    periodDays: 864.9236,
    apsisPrecessionYears: 362.1,
    nodePrecessionYears: 407.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 134,
    planet: "Saturn",
    name: "Siarnaq",
    iauCode: "629",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17881100,
    e: 0.308,
    argPeriapsisDeg: 68.4,
    meanAnomalyDeg: 62.7,
    inclinationDeg: 47.8,
    ascendingNodeDeg: 64,
    periodDays: 892.6799,
    apsisPrecessionYears: 680.6,
    nodePrecessionYears: 598.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 135,
    planet: "Saturn",
    name: "Thrymr",
    iauCode: "630",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20330500,
    e: 0.467,
    argPeriapsisDeg: 92.2,
    meanAnomalyDeg: 216.2,
    inclinationDeg: 175,
    ascendingNodeDeg: 247.3,
    periodDays: 1082.2292,
    apsisPrecessionYears: 166.6,
    nodePrecessionYears: 263.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 136,
    planet: "Saturn",
    name: "Narvi",
    iauCode: "631",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19285e3,
    e: 0.441,
    argPeriapsisDeg: 177.9,
    meanAnomalyDeg: 111.5,
    inclinationDeg: 142.2,
    ascendingNodeDeg: 179,
    periodDays: 999.9417,
    apsisPrecessionYears: 323.7,
    nodePrecessionYears: 367.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 137,
    planet: "Saturn",
    name: "Aegir",
    iauCode: "636",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20664400,
    e: 0.255,
    argPeriapsisDeg: 244.7,
    meanAnomalyDeg: 23.5,
    inclinationDeg: 166.1,
    ascendingNodeDeg: 181.9,
    periodDays: 1109.1278,
    apsisPrecessionYears: 196.6,
    nodePrecessionYears: 348.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 138,
    planet: "Saturn",
    name: "Bebhionn",
    iauCode: "637",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17027300,
    e: 0.459,
    argPeriapsisDeg: 5.1,
    meanAnomalyDeg: 128.4,
    inclinationDeg: 38.6,
    ascendingNodeDeg: 197.7,
    periodDays: 829.6437,
    apsisPrecessionYears: 409.2,
    nodePrecessionYears: 451,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 139,
    planet: "Saturn",
    name: "Bergelmir",
    iauCode: "638",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19268100,
    e: 0.145,
    argPeriapsisDeg: 133.9,
    meanAnomalyDeg: 255.7,
    inclinationDeg: 158.8,
    ascendingNodeDeg: 207.9,
    periodDays: 998.6187,
    apsisPrecessionYears: 246.1,
    nodePrecessionYears: 430.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 140,
    planet: "Saturn",
    name: "Bestla",
    iauCode: "639",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20337800,
    e: 0.486,
    argPeriapsisDeg: 85.6,
    meanAnomalyDeg: 33.1,
    inclinationDeg: 138.3,
    ascendingNodeDeg: 283,
    periodDays: 1082.9444,
    apsisPrecessionYears: 333.3,
    nodePrecessionYears: 333.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 141,
    planet: "Saturn",
    name: "Farbauti",
    iauCode: "640",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20290700,
    e: 0.249,
    argPeriapsisDeg: 343.6,
    meanAnomalyDeg: 9,
    inclinationDeg: 156.2,
    ascendingNodeDeg: 138,
    periodDays: 1079.1243,
    apsisPrecessionYears: 230.5,
    nodePrecessionYears: 374.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 142,
    planet: "Saturn",
    name: "Fenrir",
    iauCode: "641",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22330800,
    e: 0.137,
    argPeriapsisDeg: 114.5,
    meanAnomalyDeg: 38.6,
    inclinationDeg: 164.5,
    ascendingNodeDeg: 234.6,
    periodDays: 1245.9215,
    apsisPrecessionYears: 189.4,
    nodePrecessionYears: 350.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 143,
    planet: "Saturn",
    name: "Fornjot",
    iauCode: "642",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 24936800,
    e: 0.213,
    argPeriapsisDeg: 321.9,
    meanAnomalyDeg: 53.5,
    inclinationDeg: 170,
    ascendingNodeDeg: 269.3,
    periodDays: 1470.3618,
    apsisPrecessionYears: 150.5,
    nodePrecessionYears: 278.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 144,
    planet: "Saturn",
    name: "Hati",
    iauCode: "643",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19695e3,
    e: 0.372,
    argPeriapsisDeg: 10.4,
    meanAnomalyDeg: 270.6,
    inclinationDeg: 165.4,
    ascendingNodeDeg: 316.3,
    periodDays: 1032.0236,
    apsisPrecessionYears: 199,
    nodePrecessionYears: 325.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 145,
    planet: "Saturn",
    name: "Hyrrokkin",
    iauCode: "644",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18340900,
    e: 0.336,
    argPeriapsisDeg: 264.8,
    meanAnomalyDeg: 214.8,
    inclinationDeg: 149.9,
    ascendingNodeDeg: 40.2,
    periodDays: 927.4569,
    apsisPrecessionYears: 296.4,
    nodePrecessionYears: 418,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 146,
    planet: "Saturn",
    name: "Kari",
    iauCode: "645",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22032100,
    e: 0.469,
    argPeriapsisDeg: 160.2,
    meanAnomalyDeg: 83.1,
    inclinationDeg: 153,
    ascendingNodeDeg: 288.3,
    periodDays: 1220.9757,
    apsisPrecessionYears: 196.7,
    nodePrecessionYears: 264.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 147,
    planet: "Saturn",
    name: "Loge",
    iauCode: "646",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22919200,
    e: 0.191,
    argPeriapsisDeg: 20.5,
    meanAnomalyDeg: 32.1,
    inclinationDeg: 168.1,
    ascendingNodeDeg: 333,
    periodDays: 1295.5243,
    apsisPrecessionYears: 161.8,
    nodePrecessionYears: 299.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 148,
    planet: "Saturn",
    name: "Skoll",
    iauCode: "647",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17623400,
    e: 0.463,
    argPeriapsisDeg: 186.1,
    meanAnomalyDeg: 181.2,
    inclinationDeg: 159.4,
    ascendingNodeDeg: 294,
    periodDays: 873.5736,
    apsisPrecessionYears: 232.4,
    nodePrecessionYears: 337.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 149,
    planet: "Saturn",
    name: "Surtur",
    iauCode: "648",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22748e3,
    e: 0.448,
    argPeriapsisDeg: 314.4,
    meanAnomalyDeg: 9.9,
    inclinationDeg: 168.4,
    ascendingNodeDeg: 255.3,
    periodDays: 1281.1396,
    apsisPrecessionYears: 142,
    nodePrecessionYears: 222.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 150,
    planet: "Saturn",
    name: "Jarnsaxa",
    iauCode: "650",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19273500,
    e: 0.218,
    argPeriapsisDeg: 229.2,
    meanAnomalyDeg: 175.5,
    inclinationDeg: 163,
    ascendingNodeDeg: 9.2,
    periodDays: 999.1271,
    apsisPrecessionYears: 232.1,
    nodePrecessionYears: 410.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 151,
    planet: "Saturn",
    name: "Greip",
    iauCode: "651",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 1838e4,
    e: 0.317,
    argPeriapsisDeg: 146.2,
    meanAnomalyDeg: 355.9,
    inclinationDeg: 174.2,
    ascendingNodeDeg: 335.8,
    periodDays: 930.4389,
    apsisPrecessionYears: 212.7,
    nodePrecessionYears: 376.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 152,
    planet: "Saturn",
    name: "Tarqeq",
    iauCode: "652",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17751e3,
    e: 0.144,
    argPeriapsisDeg: 72.2,
    meanAnomalyDeg: 292.8,
    inclinationDeg: 48.7,
    ascendingNodeDeg: 93.3,
    periodDays: 882.8514,
    apsisPrecessionYears: 779.6,
    nodePrecessionYears: 686.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 153,
    planet: "Saturn",
    name: "Gridr",
    iauCode: "654",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19250600,
    e: 0.187,
    argPeriapsisDeg: 271.4,
    meanAnomalyDeg: 197,
    inclinationDeg: 163.9,
    ascendingNodeDeg: 330.8,
    periodDays: 997.3319,
    apsisPrecessionYears: 225.9,
    nodePrecessionYears: 407.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 154,
    planet: "Saturn",
    name: "Angrboda",
    iauCode: "655",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20591500,
    e: 0.216,
    argPeriapsisDeg: 104.2,
    meanAnomalyDeg: 263,
    inclinationDeg: 177.7,
    ascendingNodeDeg: 279.1,
    periodDays: 1103.1986,
    apsisPrecessionYears: 190.8,
    nodePrecessionYears: 360.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 155,
    planet: "Saturn",
    name: "Skrymir",
    iauCode: "656",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21447400,
    e: 0.437,
    argPeriapsisDeg: 68.1,
    meanAnomalyDeg: 68.9,
    inclinationDeg: 175.6,
    ascendingNodeDeg: 177.7,
    periodDays: 1172.7215,
    apsisPrecessionYears: 152.5,
    nodePrecessionYears: 247.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 156,
    planet: "Saturn",
    name: "Gerd",
    iauCode: "657",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20947500,
    e: 0.517,
    argPeriapsisDeg: 307.2,
    meanAnomalyDeg: 49.5,
    inclinationDeg: 174.4,
    ascendingNodeDeg: 260.4,
    periodDays: 1131.9062,
    apsisPrecessionYears: 147.3,
    nodePrecessionYears: 222.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 157,
    planet: "Saturn",
    name: "S/2004_S_26",
    iauCode: "658",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 26097500,
    e: 0.147,
    argPeriapsisDeg: 148.4,
    meanAnomalyDeg: 193.6,
    inclinationDeg: 172.9,
    ascendingNodeDeg: 328.8,
    periodDays: 1574.2535,
    apsisPrecessionYears: 142,
    nodePrecessionYears: 273.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 158,
    planet: "Saturn",
    name: "Eggther",
    iauCode: "659",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19844600,
    e: 0.157,
    argPeriapsisDeg: 130.1,
    meanAnomalyDeg: 111.7,
    inclinationDeg: 165,
    ascendingNodeDeg: 84.5,
    periodDays: 1043.8035,
    apsisPrecessionYears: 218.9,
    nodePrecessionYears: 403,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 159,
    planet: "Saturn",
    name: "S/2004_S_29",
    iauCode: "660",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17063900,
    e: 0.485,
    argPeriapsisDeg: 309.5,
    meanAnomalyDeg: 244.1,
    inclinationDeg: 38.6,
    ascendingNodeDeg: 157.9,
    periodDays: 832.2736,
    apsisPrecessionYears: 382.2,
    nodePrecessionYears: 414.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 160,
    planet: "Saturn",
    name: "Beli",
    iauCode: "661",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20703700,
    e: 0.087,
    argPeriapsisDeg: 263.5,
    meanAnomalyDeg: 191.7,
    inclinationDeg: 158.9,
    ascendingNodeDeg: 258.7,
    periodDays: 1112.2687,
    apsisPrecessionYears: 220.2,
    nodePrecessionYears: 392.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 161,
    planet: "Saturn",
    name: "Gunnlod",
    iauCode: "662",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21141800,
    e: 0.251,
    argPeriapsisDeg: 24.7,
    meanAnomalyDeg: 311.4,
    inclinationDeg: 160.4,
    ascendingNodeDeg: 293.3,
    periodDays: 1147.7354,
    apsisPrecessionYears: 210,
    nodePrecessionYears: 356.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 162,
    planet: "Saturn",
    name: "Thiazzi",
    iauCode: "663",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23577500,
    e: 0.511,
    argPeriapsisDeg: 303.2,
    meanAnomalyDeg: 334.7,
    inclinationDeg: 158.8,
    ascendingNodeDeg: 73.1,
    periodDays: 1351.8319,
    apsisPrecessionYears: 144.9,
    nodePrecessionYears: 201.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 163,
    planet: "Saturn",
    name: "S/2004_S_34",
    iauCode: "664",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 24145800,
    e: 0.279,
    argPeriapsisDeg: 354.5,
    meanAnomalyDeg: 160,
    inclinationDeg: 168.3,
    ascendingNodeDeg: 292.6,
    periodDays: 1400.9299,
    apsisPrecessionYears: 142.2,
    nodePrecessionYears: 251.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 164,
    planet: "Saturn",
    name: "Alvaldi",
    iauCode: "665",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21993800,
    e: 0.238,
    argPeriapsisDeg: 188.1,
    meanAnomalyDeg: 38.3,
    inclinationDeg: 177.4,
    ascendingNodeDeg: 321.8,
    periodDays: 1217.8042,
    apsisPrecessionYears: 171.9,
    nodePrecessionYears: 320.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 165,
    planet: "Saturn",
    name: "Geirrod",
    iauCode: "666",
    ephemeris: "SAT456",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22259400,
    e: 0.539,
    argPeriapsisDeg: 349.6,
    meanAnomalyDeg: 202.2,
    inclinationDeg: 154.4,
    ascendingNodeDeg: 127.9,
    periodDays: 1240.0465,
    apsisPrecessionYears: 177.2,
    nodePrecessionYears: 229.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "48"
  },
  {
    id: 166,
    planet: "Saturn",
    name: "S2004_S_31",
    iauCode: "65067",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17497100,
    e: 0.159,
    argPeriapsisDeg: 253.9,
    meanAnomalyDeg: 261.8,
    inclinationDeg: 48,
    ascendingNodeDeg: 82.5,
    periodDays: 863.9229,
    apsisPrecessionYears: 777,
    nodePrecessionYears: 705.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 167,
    planet: "Saturn",
    name: "S2004_S_24",
    iauCode: "65070",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23338200,
    e: 0.071,
    argPeriapsisDeg: 338.4,
    meanAnomalyDeg: 122.1,
    inclinationDeg: 37.4,
    ascendingNodeDeg: 354,
    periodDays: 1331.3222,
    apsisPrecessionYears: 286.4,
    nodePrecessionYears: 386.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 168,
    planet: "Saturn",
    name: "S2004_S_28",
    iauCode: "65077",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21865900,
    e: 0.159,
    argPeriapsisDeg: 191.9,
    meanAnomalyDeg: 95.8,
    inclinationDeg: 167.9,
    ascendingNodeDeg: 128.8,
    periodDays: 1207.1833,
    apsisPrecessionYears: 179.2,
    nodePrecessionYears: 336,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 169,
    planet: "Saturn",
    name: "S2004_S_21",
    iauCode: "65079",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23160900,
    e: 0.394,
    argPeriapsisDeg: 174.9,
    meanAnomalyDeg: 198.7,
    inclinationDeg: 153.2,
    ascendingNodeDeg: 112.3,
    periodDays: 1316.1167,
    apsisPrecessionYears: 188.1,
    nodePrecessionYears: 268.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 170,
    planet: "Saturn",
    name: "S2004_S_36",
    iauCode: "65081",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23390800,
    e: 0.625,
    argPeriapsisDeg: 213.4,
    meanAnomalyDeg: 132,
    inclinationDeg: 153.3,
    ascendingNodeDeg: 212.7,
    periodDays: 1335.8042,
    apsisPrecessionYears: 145.7,
    nodePrecessionYears: 173.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 171,
    planet: "Saturn",
    name: "S2004_S_37",
    iauCode: "65082",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 15956300,
    e: 0.448,
    argPeriapsisDeg: 72.4,
    meanAnomalyDeg: 187.6,
    inclinationDeg: 158.2,
    ascendingNodeDeg: 135.3,
    periodDays: 752.5465,
    apsisPrecessionYears: 284.6,
    nodePrecessionYears: 413.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 172,
    planet: "Saturn",
    name: "S2004_S_39",
    iauCode: "65084",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23192400,
    e: 0.1,
    argPeriapsisDeg: 223.3,
    meanAnomalyDeg: 83.8,
    inclinationDeg: 165.9,
    ascendingNodeDeg: 168.9,
    periodDays: 1318.7417,
    apsisPrecessionYears: 174.4,
    nodePrecessionYears: 328.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 173,
    planet: "Saturn",
    name: "S2004_S_7",
    iauCode: "65085",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21327600,
    e: 0.511,
    argPeriapsisDeg: 54.9,
    meanAnomalyDeg: 116.9,
    inclinationDeg: 164.8,
    ascendingNodeDeg: 323.8,
    periodDays: 1162.9264,
    apsisPrecessionYears: 162.5,
    nodePrecessionYears: 237,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 174,
    planet: "Saturn",
    name: "S2004_S_12",
    iauCode: "65086",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19801e3,
    e: 0.337,
    argPeriapsisDeg: 88.1,
    meanAnomalyDeg: 10.9,
    inclinationDeg: 164.7,
    ascendingNodeDeg: 306,
    periodDays: 1040.3896,
    apsisPrecessionYears: 199,
    nodePrecessionYears: 331.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 175,
    planet: "Saturn",
    name: "S2004_S_13",
    iauCode: "65087",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18453700,
    e: 0.265,
    argPeriapsisDeg: 355.4,
    meanAnomalyDeg: 51.9,
    inclinationDeg: 169,
    ascendingNodeDeg: 217.8,
    periodDays: 936.0889,
    apsisPrecessionYears: 221.3,
    nodePrecessionYears: 396.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 176,
    planet: "Saturn",
    name: "S2004_S_17",
    iauCode: "65088",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19699e3,
    e: 0.162,
    argPeriapsisDeg: 184.5,
    meanAnomalyDeg: 227.6,
    inclinationDeg: 167.9,
    ascendingNodeDeg: 12.5,
    periodDays: 1032.3694,
    apsisPrecessionYears: 208.4,
    nodePrecessionYears: 390.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 177,
    planet: "Saturn",
    name: "S2006_S_1",
    iauCode: "65089",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18746300,
    e: 0.105,
    argPeriapsisDeg: 159.7,
    meanAnomalyDeg: 86.3,
    inclinationDeg: 156.1,
    ascendingNodeDeg: 333.6,
    periodDays: 958.3236,
    apsisPrecessionYears: 278.3,
    nodePrecessionYears: 477.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 178,
    planet: "Saturn",
    name: "S2006_S_3",
    iauCode: "65090",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21353100,
    e: 0.432,
    argPeriapsisDeg: 191.6,
    meanAnomalyDeg: 125.3,
    inclinationDeg: 156.1,
    ascendingNodeDeg: 213.3,
    periodDays: 1165.0194,
    apsisPrecessionYears: 190.1,
    nodePrecessionYears: 273.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 179,
    planet: "Saturn",
    name: "S2007_S_2",
    iauCode: "65091",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 15939100,
    e: 0.232,
    argPeriapsisDeg: 46.4,
    meanAnomalyDeg: 10,
    inclinationDeg: 174,
    ascendingNodeDeg: 107.3,
    periodDays: 751.3306,
    apsisPrecessionYears: 275.8,
    nodePrecessionYears: 513.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 180,
    planet: "Saturn",
    name: "S2007_S_3",
    iauCode: "65092",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19614400,
    e: 0.15,
    argPeriapsisDeg: 323.1,
    meanAnomalyDeg: 304.5,
    inclinationDeg: 173.8,
    ascendingNodeDeg: 99.3,
    periodDays: 1025.6986,
    apsisPrecessionYears: 206.2,
    nodePrecessionYears: 397.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 181,
    planet: "Saturn",
    name: "S2019_S_1",
    iauCode: "65093",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11245400,
    e: 0.383,
    argPeriapsisDeg: 86.6,
    meanAnomalyDeg: 36.5,
    inclinationDeg: 49.5,
    ascendingNodeDeg: 185.6,
    periodDays: 445.1701,
    apsisPrecessionYears: 1402.9,
    nodePrecessionYears: 1111.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 182,
    planet: "Saturn",
    name: "S2019_S_2",
    iauCode: "65094",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16560300,
    e: 0.279,
    argPeriapsisDeg: 103.2,
    meanAnomalyDeg: 185.1,
    inclinationDeg: 173.3,
    ascendingNodeDeg: 95.3,
    periodDays: 795.6722,
    apsisPrecessionYears: 256.9,
    nodePrecessionYears: 464.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 183,
    planet: "Saturn",
    name: "S2019_S_3",
    iauCode: "65095",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17077400,
    e: 0.248,
    argPeriapsisDeg: 129.2,
    meanAnomalyDeg: 150.3,
    inclinationDeg: 166.9,
    ascendingNodeDeg: 243.9,
    periodDays: 833.1917,
    apsisPrecessionYears: 261.1,
    nodePrecessionYears: 466.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 184,
    planet: "Saturn",
    name: "S2020_S_1",
    iauCode: "65096",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11338600,
    e: 0.337,
    argPeriapsisDeg: 73.2,
    meanAnomalyDeg: 2.1,
    inclinationDeg: 48.2,
    ascendingNodeDeg: 161.7,
    periodDays: 450.7722,
    apsisPrecessionYears: 1327.3,
    nodePrecessionYears: 1136.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 185,
    planet: "Saturn",
    name: "S2020_S_2",
    iauCode: "65097",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17869e3,
    e: 0.152,
    argPeriapsisDeg: 130.7,
    meanAnomalyDeg: 19.2,
    inclinationDeg: 170.7,
    ascendingNodeDeg: 96.2,
    periodDays: 891.8576,
    apsisPrecessionYears: 240.2,
    nodePrecessionYears: 457.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 186,
    planet: "Saturn",
    name: "S2004_S_40",
    iauCode: "65098",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16075600,
    e: 0.297,
    argPeriapsisDeg: 127.5,
    meanAnomalyDeg: 291.4,
    inclinationDeg: 169.2,
    ascendingNodeDeg: 37.9,
    periodDays: 760.9993,
    apsisPrecessionYears: 266.8,
    nodePrecessionYears: 469.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 187,
    planet: "Saturn",
    name: "S2006_S_9",
    iauCode: "65100",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 14406700,
    e: 0.249,
    argPeriapsisDeg: 341.9,
    meanAnomalyDeg: 65.2,
    inclinationDeg: 173,
    ascendingNodeDeg: 36,
    periodDays: 645.5771,
    apsisPrecessionYears: 321.4,
    nodePrecessionYears: 590.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 188,
    planet: "Saturn",
    name: "S2007_S_5",
    iauCode: "65101",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 15835600,
    e: 0.104,
    argPeriapsisDeg: 44.4,
    meanAnomalyDeg: 23.2,
    inclinationDeg: 158.4,
    ascendingNodeDeg: 128.9,
    periodDays: 744.0056,
    apsisPrecessionYears: 337.2,
    nodePrecessionYears: 594.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 189,
    planet: "Saturn",
    name: "S2020_S_3",
    iauCode: "65102",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18056800,
    e: 0.142,
    argPeriapsisDeg: 317.6,
    meanAnomalyDeg: 135.8,
    inclinationDeg: 46,
    ascendingNodeDeg: 216.8,
    periodDays: 905.841,
    apsisPrecessionYears: 640.2,
    nodePrecessionYears: 639.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 190,
    planet: "Saturn",
    name: "S2019_S_4",
    iauCode: "65103",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17951900,
    e: 0.408,
    argPeriapsisDeg: 247,
    meanAnomalyDeg: 217.8,
    inclinationDeg: 170.1,
    ascendingNodeDeg: 301.4,
    periodDays: 898.0889,
    apsisPrecessionYears: 212.9,
    nodePrecessionYears: 347.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 191,
    planet: "Saturn",
    name: "S2004_S_41",
    iauCode: "65104",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18095400,
    e: 0.301,
    argPeriapsisDeg: 232.6,
    meanAnomalyDeg: 343.6,
    inclinationDeg: 165.7,
    ascendingNodeDeg: 43.6,
    periodDays: 908.8924,
    apsisPrecessionYears: 230.2,
    nodePrecessionYears: 396,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 192,
    planet: "Saturn",
    name: "S2020_S_4",
    iauCode: "65105",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18236400,
    e: 0.496,
    argPeriapsisDeg: 157.7,
    meanAnomalyDeg: 178.7,
    inclinationDeg: 40.1,
    ascendingNodeDeg: 67.8,
    periodDays: 919.5174,
    apsisPrecessionYears: 357.8,
    nodePrecessionYears: 371.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 193,
    planet: "Saturn",
    name: "S2020_S_5",
    iauCode: "65106",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18391e3,
    e: 0.22,
    argPeriapsisDeg: 285.7,
    meanAnomalyDeg: 232,
    inclinationDeg: 48.2,
    ascendingNodeDeg: 214.9,
    periodDays: 931.1889,
    apsisPrecessionYears: 686.8,
    nodePrecessionYears: 610.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 194,
    planet: "Saturn",
    name: "S2007_S_6",
    iauCode: "65107",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18545e3,
    e: 0.168,
    argPeriapsisDeg: 19.2,
    meanAnomalyDeg: 347.8,
    inclinationDeg: 166.5,
    ascendingNodeDeg: 324.1,
    periodDays: 942.9785,
    apsisPrecessionYears: 230.6,
    nodePrecessionYears: 427.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 195,
    planet: "Saturn",
    name: "S2004_S_42",
    iauCode: "65108",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18240700,
    e: 0.158,
    argPeriapsisDeg: 107.2,
    meanAnomalyDeg: 325.2,
    inclinationDeg: 165.7,
    ascendingNodeDeg: 3.9,
    periodDays: 919.8847,
    apsisPrecessionYears: 242.5,
    nodePrecessionYears: 448.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 196,
    planet: "Saturn",
    name: "S2006_S_10",
    iauCode: "65109",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18979900,
    e: 0.151,
    argPeriapsisDeg: 79.7,
    meanAnomalyDeg: 173.5,
    inclinationDeg: 161.6,
    ascendingNodeDeg: 350.8,
    periodDays: 976.3438,
    apsisPrecessionYears: 246.2,
    nodePrecessionYears: 442.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 197,
    planet: "Saturn",
    name: "S2019_S_5",
    iauCode: "65110",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19090100,
    e: 0.216,
    argPeriapsisDeg: 321.5,
    meanAnomalyDeg: 59.4,
    inclinationDeg: 158.8,
    ascendingNodeDeg: 271.1,
    periodDays: 984.8722,
    apsisPrecessionYears: 249.9,
    nodePrecessionYears: 424.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 198,
    planet: "Saturn",
    name: "S2004_S_43",
    iauCode: "65111",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18935700,
    e: 0.432,
    argPeriapsisDeg: 234,
    meanAnomalyDeg: 14.5,
    inclinationDeg: 171.1,
    ascendingNodeDeg: 191.9,
    periodDays: 972.8528,
    apsisPrecessionYears: 196.2,
    nodePrecessionYears: 315.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 199,
    planet: "Saturn",
    name: "S2004_S_44",
    iauCode: "65112",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19515400,
    e: 0.129,
    argPeriapsisDeg: 176.4,
    meanAnomalyDeg: 292.8,
    inclinationDeg: 167.7,
    ascendingNodeDeg: 39.5,
    periodDays: 1017.9146,
    apsisPrecessionYears: 219.2,
    nodePrecessionYears: 414.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 200,
    planet: "Saturn",
    name: "S2004_S_45",
    iauCode: "65113",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19693700,
    e: 0.551,
    argPeriapsisDeg: 350.6,
    meanAnomalyDeg: 75.7,
    inclinationDeg: 154,
    ascendingNodeDeg: 306,
    periodDays: 1031.8604,
    apsisPrecessionYears: 210.7,
    nodePrecessionYears: 269.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 201,
    planet: "Saturn",
    name: "S2006_S_11",
    iauCode: "65114",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19711900,
    e: 0.143,
    argPeriapsisDeg: 159.9,
    meanAnomalyDeg: 353.1,
    inclinationDeg: 174.1,
    ascendingNodeDeg: 254.4,
    periodDays: 1033.3521,
    apsisPrecessionYears: 199.2,
    nodePrecessionYears: 385.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 202,
    planet: "Saturn",
    name: "S2006_S_12",
    iauCode: "65115",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19570300,
    e: 0.542,
    argPeriapsisDeg: 78.1,
    meanAnomalyDeg: 249.6,
    inclinationDeg: 38.6,
    ascendingNodeDeg: 155.1,
    periodDays: 1022.2868,
    apsisPrecessionYears: 292.1,
    nodePrecessionYears: 304.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 203,
    planet: "Saturn",
    name: "S2019_S_6",
    iauCode: "65116",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18205600,
    e: 0.12,
    argPeriapsisDeg: 286.9,
    meanAnomalyDeg: 185.7,
    inclinationDeg: 46.4,
    ascendingNodeDeg: 154.2,
    periodDays: 917.1056,
    apsisPrecessionYears: 654,
    nodePrecessionYears: 647,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 204,
    planet: "Saturn",
    name: "S2006_S_13",
    iauCode: "65117",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19953300,
    e: 0.313,
    argPeriapsisDeg: 254.7,
    meanAnomalyDeg: 248.5,
    inclinationDeg: 162,
    ascendingNodeDeg: 44.4,
    periodDays: 1052.316,
    apsisPrecessionYears: 216.5,
    nodePrecessionYears: 359.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 205,
    planet: "Saturn",
    name: "S2019_S_7",
    iauCode: "65118",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20185100,
    e: 0.233,
    argPeriapsisDeg: 6.3,
    meanAnomalyDeg: 336,
    inclinationDeg: 174.2,
    ascendingNodeDeg: 226.6,
    periodDays: 1070.8007,
    apsisPrecessionYears: 197.4,
    nodePrecessionYears: 367.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 206,
    planet: "Saturn",
    name: "S2019_S_8",
    iauCode: "65119",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20287400,
    e: 0.311,
    argPeriapsisDeg: 144.6,
    meanAnomalyDeg: 31.8,
    inclinationDeg: 172.8,
    ascendingNodeDeg: 168.6,
    periodDays: 1078.8604,
    apsisPrecessionYears: 187.1,
    nodePrecessionYears: 330.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 207,
    planet: "Saturn",
    name: "S2019_S_9",
    iauCode: "65120",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20359700,
    e: 0.433,
    argPeriapsisDeg: 316.4,
    meanAnomalyDeg: 244.7,
    inclinationDeg: 159.5,
    ascendingNodeDeg: 114.2,
    periodDays: 1084.6194,
    apsisPrecessionYears: 189.5,
    nodePrecessionYears: 282.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 208,
    planet: "Saturn",
    name: "S2004_S_46",
    iauCode: "65121",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20513800,
    e: 0.249,
    argPeriapsisDeg: 298.1,
    meanAnomalyDeg: 209.2,
    inclinationDeg: 177.2,
    ascendingNodeDeg: 281.1,
    periodDays: 1096.9882,
    apsisPrecessionYears: 187.8,
    nodePrecessionYears: 348.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 209,
    planet: "Saturn",
    name: "S2019_S_10",
    iauCode: "65122",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20700300,
    e: 0.248,
    argPeriapsisDeg: 352.9,
    meanAnomalyDeg: 149.5,
    inclinationDeg: 163.9,
    ascendingNodeDeg: 274.7,
    periodDays: 1111.9924,
    apsisPrecessionYears: 204.4,
    nodePrecessionYears: 358.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 210,
    planet: "Saturn",
    name: "S2004_S_47",
    iauCode: "65123",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16050700,
    e: 0.291,
    argPeriapsisDeg: 295.4,
    meanAnomalyDeg: 25.2,
    inclinationDeg: 160.9,
    ascendingNodeDeg: 294.8,
    periodDays: 759.2201,
    apsisPrecessionYears: 297.7,
    nodePrecessionYears: 496.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 211,
    planet: "Saturn",
    name: "S2019_S_11",
    iauCode: "65124",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20664200,
    e: 0.513,
    argPeriapsisDeg: 28.2,
    meanAnomalyDeg: 190.5,
    inclinationDeg: 144.6,
    ascendingNodeDeg: 327.6,
    periodDays: 1109.1097,
    apsisPrecessionYears: 245.7,
    nodePrecessionYears: 279.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 212,
    planet: "Saturn",
    name: "S2006_S_14",
    iauCode: "65125",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21062300,
    e: 0.06,
    argPeriapsisDeg: 136.1,
    meanAnomalyDeg: 264.7,
    inclinationDeg: 166.7,
    ascendingNodeDeg: 274.4,
    periodDays: 1141.2708,
    apsisPrecessionYears: 196.9,
    nodePrecessionYears: 376.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 213,
    planet: "Saturn",
    name: "S2019_S_12",
    iauCode: "65126",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20895e3,
    e: 0.476,
    argPeriapsisDeg: 240.2,
    meanAnomalyDeg: 221.1,
    inclinationDeg: 167.1,
    ascendingNodeDeg: 324.7,
    periodDays: 1127.5993,
    apsisPrecessionYears: 170.4,
    nodePrecessionYears: 259.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 214,
    planet: "Saturn",
    name: "S2020_S_6",
    iauCode: "65127",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21253300,
    e: 0.48,
    argPeriapsisDeg: 27.9,
    meanAnomalyDeg: 271.2,
    inclinationDeg: 166.9,
    ascendingNodeDeg: 7,
    periodDays: 1156.8111,
    apsisPrecessionYears: 156.3,
    nodePrecessionYears: 237,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 215,
    planet: "Saturn",
    name: "S2019_S_13",
    iauCode: "65128",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20964500,
    e: 0.318,
    argPeriapsisDeg: 219.8,
    meanAnomalyDeg: 138.5,
    inclinationDeg: 177.3,
    ascendingNodeDeg: 302.5,
    periodDays: 1133.2653,
    apsisPrecessionYears: 175.2,
    nodePrecessionYears: 311.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 216,
    planet: "Saturn",
    name: "S2005_S_4",
    iauCode: "65129",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11324500,
    e: 0.315,
    argPeriapsisDeg: 107.1,
    meanAnomalyDeg: 247.1,
    inclinationDeg: 48,
    ascendingNodeDeg: 169.4,
    periodDays: 449.925,
    apsisPrecessionYears: 1334.1,
    nodePrecessionYears: 1161.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 217,
    planet: "Saturn",
    name: "S2007_S_7",
    iauCode: "65130",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 15931600,
    e: 0.217,
    argPeriapsisDeg: 149.6,
    meanAnomalyDeg: 63.4,
    inclinationDeg: 169.3,
    ascendingNodeDeg: 3.8,
    periodDays: 750.7958,
    apsisPrecessionYears: 282.6,
    nodePrecessionYears: 520.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 218,
    planet: "Saturn",
    name: "S2007_S_8",
    iauCode: "65131",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17048900,
    e: 0.49,
    argPeriapsisDeg: 258.7,
    meanAnomalyDeg: 6.3,
    inclinationDeg: 36.2,
    ascendingNodeDeg: 202.2,
    periodDays: 831.2111,
    apsisPrecessionYears: 354.7,
    nodePrecessionYears: 403.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 219,
    planet: "Saturn",
    name: "S2020_S_7",
    iauCode: "65132",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17394e3,
    e: 0.5,
    argPeriapsisDeg: 298.8,
    meanAnomalyDeg: 215.8,
    inclinationDeg: 161.4,
    ascendingNodeDeg: 175.7,
    periodDays: 856.534,
    apsisPrecessionYears: 226.8,
    nodePrecessionYears: 325.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 220,
    planet: "Saturn",
    name: "S2019_S_14",
    iauCode: "65133",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17852800,
    e: 0.172,
    argPeriapsisDeg: 303.2,
    meanAnomalyDeg: 240.9,
    inclinationDeg: 46.2,
    ascendingNodeDeg: 149.6,
    periodDays: 890.5868,
    apsisPrecessionYears: 649.3,
    nodePrecessionYears: 639.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 221,
    planet: "Saturn",
    name: "S2019_S_15",
    iauCode: "65134",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21191100,
    e: 0.257,
    argPeriapsisDeg: 17.9,
    meanAnomalyDeg: 302.9,
    inclinationDeg: 157.8,
    ascendingNodeDeg: 22,
    periodDays: 1151.6611,
    apsisPrecessionYears: 214.1,
    nodePrecessionYears: 352.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 222,
    planet: "Saturn",
    name: "S2005_S_5",
    iauCode: "65135",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21364900,
    e: 0.588,
    argPeriapsisDeg: 284.6,
    meanAnomalyDeg: 9.9,
    inclinationDeg: 169.5,
    ascendingNodeDeg: 84.7,
    periodDays: 1165.9562,
    apsisPrecessionYears: 137.8,
    nodePrecessionYears: 193,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 223,
    planet: "Saturn",
    name: "S2006_S_15",
    iauCode: "65136",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21799600,
    e: 0.117,
    argPeriapsisDeg: 224.8,
    meanAnomalyDeg: 313.6,
    inclinationDeg: 161.1,
    ascendingNodeDeg: 12.2,
    periodDays: 1201.6924,
    apsisPrecessionYears: 203.8,
    nodePrecessionYears: 368.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 224,
    planet: "Saturn",
    name: "S2006_S_16",
    iauCode: "65137",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21721200,
    e: 0.204,
    argPeriapsisDeg: 282.9,
    meanAnomalyDeg: 62.5,
    inclinationDeg: 164.1,
    ascendingNodeDeg: 165.4,
    periodDays: 1195.1285,
    apsisPrecessionYears: 188,
    nodePrecessionYears: 337.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 225,
    planet: "Saturn",
    name: "S2006_S_17",
    iauCode: "65138",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22384200,
    e: 0.425,
    argPeriapsisDeg: 149.4,
    meanAnomalyDeg: 206.6,
    inclinationDeg: 168.7,
    ascendingNodeDeg: 274.1,
    periodDays: 1250.4639,
    apsisPrecessionYears: 158.2,
    nodePrecessionYears: 253.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 226,
    planet: "Saturn",
    name: "S2004_S_48",
    iauCode: "65139",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22137400,
    e: 0.374,
    argPeriapsisDeg: 286.6,
    meanAnomalyDeg: 195,
    inclinationDeg: 161.9,
    ascendingNodeDeg: 194.7,
    periodDays: 1229.8632,
    apsisPrecessionYears: 173.2,
    nodePrecessionYears: 275.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 227,
    planet: "Saturn",
    name: "S2020_S_8",
    iauCode: "65140",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21967200,
    e: 0.252,
    argPeriapsisDeg: 45,
    meanAnomalyDeg: 181.2,
    inclinationDeg: 161.8,
    ascendingNodeDeg: 41.8,
    periodDays: 1215.6063,
    apsisPrecessionYears: 186.2,
    nodePrecessionYears: 319.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 228,
    planet: "Saturn",
    name: "S2004_S_49",
    iauCode: "65141",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22399400,
    e: 0.453,
    argPeriapsisDeg: 199,
    meanAnomalyDeg: 19.2,
    inclinationDeg: 159.8,
    ascendingNodeDeg: 221.2,
    periodDays: 1251.6847,
    apsisPrecessionYears: 169.5,
    nodePrecessionYears: 249.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 229,
    planet: "Saturn",
    name: "S2004_S_50",
    iauCode: "65142",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22345e3,
    e: 0.45,
    argPeriapsisDeg: 197.8,
    meanAnomalyDeg: 71.5,
    inclinationDeg: 164,
    ascendingNodeDeg: 175.9,
    periodDays: 1247.1917,
    apsisPrecessionYears: 152.9,
    nodePrecessionYears: 233.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 230,
    planet: "Saturn",
    name: "S2006_S_18",
    iauCode: "65143",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22760600,
    e: 0.131,
    argPeriapsisDeg: 62.5,
    meanAnomalyDeg: 14.5,
    inclinationDeg: 169.5,
    ascendingNodeDeg: 47.6,
    periodDays: 1282.0917,
    apsisPrecessionYears: 166.1,
    nodePrecessionYears: 317.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 231,
    planet: "Saturn",
    name: "S2019_S_16",
    iauCode: "65144",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23265200,
    e: 0.25,
    argPeriapsisDeg: 280.6,
    meanAnomalyDeg: 351.8,
    inclinationDeg: 162,
    ascendingNodeDeg: 206.7,
    periodDays: 1324.9458,
    apsisPrecessionYears: 177.9,
    nodePrecessionYears: 306.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 232,
    planet: "Saturn",
    name: "S2019_S_17",
    iauCode: "65145",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22722700,
    e: 0.546,
    argPeriapsisDeg: 317,
    meanAnomalyDeg: 40.5,
    inclinationDeg: 155.5,
    ascendingNodeDeg: 125.3,
    periodDays: 1278.9618,
    apsisPrecessionYears: 158.6,
    nodePrecessionYears: 207,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 233,
    planet: "Saturn",
    name: "S2019_S_18",
    iauCode: "65146",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23139500,
    e: 0.509,
    argPeriapsisDeg: 304.5,
    meanAnomalyDeg: 340.4,
    inclinationDeg: 154.6,
    ascendingNodeDeg: 230.6,
    periodDays: 1314.2674,
    apsisPrecessionYears: 169.4,
    nodePrecessionYears: 225.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 234,
    planet: "Saturn",
    name: "S2019_S_19",
    iauCode: "65147",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23044400,
    e: 0.458,
    argPeriapsisDeg: 305.8,
    meanAnomalyDeg: 335.8,
    inclinationDeg: 151.8,
    ascendingNodeDeg: 248.3,
    periodDays: 1306.1604,
    apsisPrecessionYears: 179.3,
    nodePrecessionYears: 239.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 235,
    planet: "Saturn",
    name: "S2019_S_20",
    iauCode: "65148",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23677900,
    e: 0.354,
    argPeriapsisDeg: 198.6,
    meanAnomalyDeg: 281.1,
    inclinationDeg: 156,
    ascendingNodeDeg: 176.6,
    periodDays: 1360.4674,
    apsisPrecessionYears: 177.1,
    nodePrecessionYears: 269.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 236,
    planet: "Saturn",
    name: "S2006_S_19",
    iauCode: "65149",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23800500,
    e: 0.467,
    argPeriapsisDeg: 19.2,
    meanAnomalyDeg: 195.9,
    inclinationDeg: 175.5,
    ascendingNodeDeg: 281.1,
    periodDays: 1371.0201,
    apsisPrecessionYears: 132.3,
    nodePrecessionYears: 209.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 237,
    planet: "Saturn",
    name: "S2004_S_51",
    iauCode: "65150",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 25207100,
    e: 0.201,
    argPeriapsisDeg: 73.4,
    meanAnomalyDeg: 85.1,
    inclinationDeg: 171.2,
    ascendingNodeDeg: 293.7,
    periodDays: 1494.4076,
    apsisPrecessionYears: 136.6,
    nodePrecessionYears: 255.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 238,
    planet: "Saturn",
    name: "S2020_S_9",
    iauCode: "65151",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 25408700,
    e: 0.531,
    argPeriapsisDeg: 171,
    meanAnomalyDeg: 46.4,
    inclinationDeg: 161.4,
    ascendingNodeDeg: 15,
    periodDays: 1512.384,
    apsisPrecessionYears: 119.9,
    nodePrecessionYears: 167.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 239,
    planet: "Saturn",
    name: "S2004_S_52",
    iauCode: "65152",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 26446400,
    e: 0.291,
    argPeriapsisDeg: 292.6,
    meanAnomalyDeg: 333,
    inclinationDeg: 165.4,
    ascendingNodeDeg: 204.7,
    periodDays: 1605.8868,
    apsisPrecessionYears: 125.8,
    nodePrecessionYears: 217.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 240,
    planet: "Saturn",
    name: "S2007_S_9",
    iauCode: "65153",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20174600,
    e: 0.36,
    argPeriapsisDeg: 125.3,
    meanAnomalyDeg: 240.3,
    inclinationDeg: 159.3,
    ascendingNodeDeg: 269.4,
    periodDays: 1069.8069,
    apsisPrecessionYears: 212.2,
    nodePrecessionYears: 332.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 241,
    planet: "Saturn",
    name: "S2004_S_53",
    iauCode: "65154",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23279800,
    e: 0.24,
    argPeriapsisDeg: 284.3,
    meanAnomalyDeg: 37.3,
    inclinationDeg: 162.6,
    ascendingNodeDeg: 215.7,
    periodDays: 1326.184,
    apsisPrecessionYears: 177.5,
    nodePrecessionYears: 309,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 242,
    planet: "Saturn",
    name: "S2020_S_10",
    iauCode: "65155",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 25315300,
    e: 0.296,
    argPeriapsisDeg: 213.5,
    meanAnomalyDeg: 158.8,
    inclinationDeg: 165.6,
    ascendingNodeDeg: 243.6,
    periodDays: 1503.9681,
    apsisPrecessionYears: 135.8,
    nodePrecessionYears: 234.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 243,
    planet: "Saturn",
    name: "S2019_S_21",
    iauCode: "65156",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 26439500,
    e: 0.155,
    argPeriapsisDeg: 16.7,
    meanAnomalyDeg: 346.4,
    inclinationDeg: 171.9,
    ascendingNodeDeg: 342.8,
    periodDays: 1605.2799,
    apsisPrecessionYears: 138.9,
    nodePrecessionYears: 265.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 244,
    planet: "Saturn",
    name: "S2006_S_20",
    iauCode: "65157",
    ephemeris: "SAT457",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 13193700,
    e: 0.206,
    argPeriapsisDeg: 77.4,
    meanAnomalyDeg: 153.1,
    inclinationDeg: 173.1,
    ascendingNodeDeg: 60.9,
    periodDays: 565.7889,
    apsisPrecessionYears: 370.8,
    nodePrecessionYears: 697,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "49"
  },
  {
    id: 245,
    planet: "Saturn",
    name: "S2004_S54",
    iauCode: "65158",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11277500,
    e: 0.373,
    argPeriapsisDeg: 108.4,
    meanAnomalyDeg: 69.3,
    inclinationDeg: 48.1,
    ascendingNodeDeg: 80.2,
    periodDays: 447.141,
    apsisPrecessionYears: 1279.3,
    nodePrecessionYears: 1085.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 246,
    planet: "Saturn",
    name: "S2004_S55",
    iauCode: "65159",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11294700,
    e: 0.26,
    argPeriapsisDeg: 80,
    meanAnomalyDeg: 59.6,
    inclinationDeg: 48.9,
    ascendingNodeDeg: 196.6,
    periodDays: 448.1618,
    apsisPrecessionYears: 1490.5,
    nodePrecessionYears: 1261.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 247,
    planet: "Saturn",
    name: "S2004_S56",
    iauCode: "65160",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 13670200,
    e: 0.339,
    argPeriapsisDeg: 96.4,
    meanAnomalyDeg: 165.7,
    inclinationDeg: 161.6,
    ascendingNodeDeg: 343.2,
    periodDays: 596.6938,
    apsisPrecessionYears: 366.9,
    nodePrecessionYears: 596.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 248,
    planet: "Saturn",
    name: "S2004_S57",
    iauCode: "65161",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18150500,
    e: 0.263,
    argPeriapsisDeg: 60.9,
    meanAnomalyDeg: 202.7,
    inclinationDeg: 167.9,
    ascendingNodeDeg: 39.1,
    periodDays: 913.0736,
    apsisPrecessionYears: 230.2,
    nodePrecessionYears: 410.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 249,
    planet: "Saturn",
    name: "S2004_S58",
    iauCode: "65162",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18254500,
    e: 0.249,
    argPeriapsisDeg: 120,
    meanAnomalyDeg: 180.1,
    inclinationDeg: 45.7,
    ascendingNodeDeg: 284.5,
    periodDays: 920.8035,
    apsisPrecessionYears: 592.2,
    nodePrecessionYears: 582.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 250,
    planet: "Saturn",
    name: "S2004_S59",
    iauCode: "65163",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19170700,
    e: 0.262,
    argPeriapsisDeg: 222.1,
    meanAnomalyDeg: 282.6,
    inclinationDeg: 167.3,
    ascendingNodeDeg: 125.2,
    periodDays: 991.1819,
    apsisPrecessionYears: 216.8,
    nodePrecessionYears: 385.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 251,
    planet: "Saturn",
    name: "S2004_S60",
    iauCode: "65164",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19517e3,
    e: 0.28,
    argPeriapsisDeg: 264.3,
    meanAnomalyDeg: 357.6,
    inclinationDeg: 173.8,
    ascendingNodeDeg: 321.7,
    periodDays: 1018.1285,
    apsisPrecessionYears: 193.8,
    nodePrecessionYears: 350.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 252,
    planet: "Saturn",
    name: "S2004_S61",
    iauCode: "65165",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20986900,
    e: 0.466,
    argPeriapsisDeg: 40.4,
    meanAnomalyDeg: 175.6,
    inclinationDeg: 168.4,
    ascendingNodeDeg: 176.4,
    periodDays: 1135.0646,
    apsisPrecessionYears: 169.6,
    nodePrecessionYears: 262.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 253,
    planet: "Saturn",
    name: "S2005_S06",
    iauCode: "65166",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18107300,
    e: 0.084,
    argPeriapsisDeg: 77.4,
    meanAnomalyDeg: 163.4,
    inclinationDeg: 47.7,
    ascendingNodeDeg: 166.5,
    periodDays: 909.5785,
    apsisPrecessionYears: 719.1,
    nodePrecessionYears: 673.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 254,
    planet: "Saturn",
    name: "S2005_S07",
    iauCode: "65167",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18502500,
    e: 0.565,
    argPeriapsisDeg: 132.7,
    meanAnomalyDeg: 181.1,
    inclinationDeg: 34.6,
    ascendingNodeDeg: 269.8,
    periodDays: 939.7451,
    apsisPrecessionYears: 274.9,
    nodePrecessionYears: 305.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 255,
    planet: "Saturn",
    name: "S2006_S21",
    iauCode: "65168",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 14976500,
    e: 0.204,
    argPeriapsisDeg: 157.4,
    meanAnomalyDeg: 40.7,
    inclinationDeg: 169.8,
    ascendingNodeDeg: 328.3,
    periodDays: 684.2764,
    apsisPrecessionYears: 308.9,
    nodePrecessionYears: 573.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 256,
    planet: "Saturn",
    name: "S2006_S22",
    iauCode: "65169",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 15109500,
    e: 0.246,
    argPeriapsisDeg: 71.7,
    meanAnomalyDeg: 254.1,
    inclinationDeg: 172,
    ascendingNodeDeg: 231.1,
    periodDays: 693.4146,
    apsisPrecessionYears: 301.9,
    nodePrecessionYears: 553.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 257,
    planet: "Saturn",
    name: "S2006_S23",
    iauCode: "65170",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18269700,
    e: 0.19,
    argPeriapsisDeg: 72.5,
    meanAnomalyDeg: 309.9,
    inclinationDeg: 43.8,
    ascendingNodeDeg: 257.1,
    periodDays: 921.8632,
    apsisPrecessionYears: 555.2,
    nodePrecessionYears: 598.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 258,
    planet: "Saturn",
    name: "S2006_S24",
    iauCode: "65171",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18210700,
    e: 0.352,
    argPeriapsisDeg: 39.8,
    meanAnomalyDeg: 10.3,
    inclinationDeg: 165.9,
    ascendingNodeDeg: 204.8,
    periodDays: 917.559,
    apsisPrecessionYears: 229.6,
    nodePrecessionYears: 382.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 259,
    planet: "Saturn",
    name: "S2006_S25",
    iauCode: "65172",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18572400,
    e: 0.303,
    argPeriapsisDeg: 130.1,
    meanAnomalyDeg: 348.5,
    inclinationDeg: 158.8,
    ascendingNodeDeg: 277.4,
    periodDays: 945.0681,
    apsisPrecessionYears: 245.1,
    nodePrecessionYears: 397,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 260,
    planet: "Saturn",
    name: "S2006_S26",
    iauCode: "65173",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18619300,
    e: 0.248,
    argPeriapsisDeg: 2.5,
    meanAnomalyDeg: 201,
    inclinationDeg: 171.9,
    ascendingNodeDeg: 147.8,
    periodDays: 948.6722,
    apsisPrecessionYears: 219.7,
    nodePrecessionYears: 402.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 261,
    planet: "Saturn",
    name: "S2006_S27",
    iauCode: "65174",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19205700,
    e: 0.14,
    argPeriapsisDeg: 91.6,
    meanAnomalyDeg: 6.1,
    inclinationDeg: 170.5,
    ascendingNodeDeg: 3.7,
    periodDays: 993.7889,
    apsisPrecessionYears: 219.7,
    nodePrecessionYears: 420.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 262,
    planet: "Saturn",
    name: "S2006_S28",
    iauCode: "65175",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21955100,
    e: 0.21,
    argPeriapsisDeg: 242.2,
    meanAnomalyDeg: 98.4,
    inclinationDeg: 172.9,
    ascendingNodeDeg: 152.8,
    periodDays: 1214.5257,
    apsisPrecessionYears: 176.9,
    nodePrecessionYears: 331.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 263,
    planet: "Saturn",
    name: "S2006_S29",
    iauCode: "65176",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 25212100,
    e: 0.239,
    argPeriapsisDeg: 301.4,
    meanAnomalyDeg: 101.5,
    inclinationDeg: 156.2,
    ascendingNodeDeg: 82.4,
    periodDays: 1494.7833,
    apsisPrecessionYears: 175.7,
    nodePrecessionYears: 286.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 264,
    planet: "Saturn",
    name: "S2007_S10",
    iauCode: "65177",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11364900,
    e: 0.367,
    argPeriapsisDeg: 94.2,
    meanAnomalyDeg: 23.6,
    inclinationDeg: 45.8,
    ascendingNodeDeg: 287.1,
    periodDays: 452.3576,
    apsisPrecessionYears: 1105,
    nodePrecessionYears: 1033.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 265,
    planet: "Saturn",
    name: "S2007_S11",
    iauCode: "65178",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17434400,
    e: 0.499,
    argPeriapsisDeg: 348.9,
    meanAnomalyDeg: 233.9,
    inclinationDeg: 35.5,
    ascendingNodeDeg: 53.9,
    periodDays: 859.5264,
    apsisPrecessionYears: 342.1,
    nodePrecessionYears: 392.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 266,
    planet: "Saturn",
    name: "S2019_S22",
    iauCode: "65179",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11305100,
    e: 0.369,
    argPeriapsisDeg: 100.5,
    meanAnomalyDeg: 223,
    inclinationDeg: 47.3,
    ascendingNodeDeg: 21.1,
    periodDays: 448.775,
    apsisPrecessionYears: 1223.6,
    nodePrecessionYears: 1073.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 267,
    planet: "Saturn",
    name: "S2019_S23",
    iauCode: "65180",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11310200,
    e: 0.255,
    argPeriapsisDeg: 81.5,
    meanAnomalyDeg: 1,
    inclinationDeg: 48.7,
    ascendingNodeDeg: 356.3,
    periodDays: 449.0806,
    apsisPrecessionYears: 1460.7,
    nodePrecessionYears: 1253.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 268,
    planet: "Saturn",
    name: "S2019_S24",
    iauCode: "65181",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11360500,
    e: 0.345,
    argPeriapsisDeg: 74.7,
    meanAnomalyDeg: 79.3,
    inclinationDeg: 46.7,
    ascendingNodeDeg: 205.3,
    periodDays: 452.0743,
    apsisPrecessionYears: 1199.1,
    nodePrecessionYears: 1090,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 269,
    planet: "Saturn",
    name: "S2019_S25",
    iauCode: "65182",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11329400,
    e: 0.271,
    argPeriapsisDeg: 73.9,
    meanAnomalyDeg: 358.9,
    inclinationDeg: 48.1,
    ascendingNodeDeg: 213.7,
    periodDays: 450.2181,
    apsisPrecessionYears: 1381.7,
    nodePrecessionYears: 1214.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 270,
    planet: "Saturn",
    name: "S2019_S26",
    iauCode: "65183",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11390900,
    e: 0.365,
    argPeriapsisDeg: 111.3,
    meanAnomalyDeg: 164.1,
    inclinationDeg: 48.1,
    ascendingNodeDeg: 119.7,
    periodDays: 453.8882,
    apsisPrecessionYears: 1268.7,
    nodePrecessionYears: 1078,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 271,
    planet: "Saturn",
    name: "S2019_S27",
    iauCode: "65184",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16267e3,
    e: 0.42,
    argPeriapsisDeg: 97.2,
    meanAnomalyDeg: 152.1,
    inclinationDeg: 162.1,
    ascendingNodeDeg: 115.1,
    periodDays: 774.6333,
    apsisPrecessionYears: 264.9,
    nodePrecessionYears: 407.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 272,
    planet: "Saturn",
    name: "S2019_S28",
    iauCode: "65185",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17496e3,
    e: 0.199,
    argPeriapsisDeg: 95.6,
    meanAnomalyDeg: 307.9,
    inclinationDeg: 158.4,
    ascendingNodeDeg: 268.3,
    periodDays: 864.0938,
    apsisPrecessionYears: 285.1,
    nodePrecessionYears: 486.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 273,
    planet: "Saturn",
    name: "S2019_S29",
    iauCode: "65186",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17353900,
    e: 0.441,
    argPeriapsisDeg: 332.7,
    meanAnomalyDeg: 133.8,
    inclinationDeg: 37.7,
    ascendingNodeDeg: 306.9,
    periodDays: 853.6229,
    apsisPrecessionYears: 377.4,
    nodePrecessionYears: 429.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 274,
    planet: "Saturn",
    name: "S2019_S30",
    iauCode: "65187",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17709900,
    e: 0.107,
    argPeriapsisDeg: 5.3,
    meanAnomalyDeg: 187.8,
    inclinationDeg: 168.3,
    ascendingNodeDeg: 356.8,
    periodDays: 879.9708,
    apsisPrecessionYears: 254.2,
    nodePrecessionYears: 485.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 275,
    planet: "Saturn",
    name: "S2019_S31",
    iauCode: "65188",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17739100,
    e: 0.488,
    argPeriapsisDeg: 37.8,
    meanAnomalyDeg: 35.2,
    inclinationDeg: 39.8,
    ascendingNodeDeg: 173.7,
    periodDays: 882.241,
    apsisPrecessionYears: 373.9,
    nodePrecessionYears: 392.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 276,
    planet: "Saturn",
    name: "S2019_S32",
    iauCode: "65189",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17960500,
    e: 0.276,
    argPeriapsisDeg: 281.4,
    meanAnomalyDeg: 20.1,
    inclinationDeg: 46.2,
    ascendingNodeDeg: 218.1,
    periodDays: 898.7083,
    apsisPrecessionYears: 610.4,
    nodePrecessionYears: 581.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 277,
    planet: "Saturn",
    name: "S2019_S33",
    iauCode: "65190",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18696100,
    e: 0.289,
    argPeriapsisDeg: 46.9,
    meanAnomalyDeg: 245.6,
    inclinationDeg: 170.4,
    ascendingNodeDeg: 186.4,
    periodDays: 954.534,
    apsisPrecessionYears: 209,
    nodePrecessionYears: 371.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 278,
    planet: "Saturn",
    name: "S2019_S34",
    iauCode: "65191",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18446800,
    e: 0.536,
    argPeriapsisDeg: 226.7,
    meanAnomalyDeg: 78.5,
    inclinationDeg: 37.6,
    ascendingNodeDeg: 169.4,
    periodDays: 935.4472,
    apsisPrecessionYears: 322.1,
    nodePrecessionYears: 344.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 279,
    planet: "Saturn",
    name: "S2019_S35",
    iauCode: "65192",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18557800,
    e: 0.577,
    argPeriapsisDeg: 181.1,
    meanAnomalyDeg: 259,
    inclinationDeg: 157.3,
    ascendingNodeDeg: 63.3,
    periodDays: 943.9993,
    apsisPrecessionYears: 200.7,
    nodePrecessionYears: 260.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 280,
    planet: "Saturn",
    name: "S2019_S36",
    iauCode: "65193",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19903200,
    e: 0.161,
    argPeriapsisDeg: 278.1,
    meanAnomalyDeg: 145.8,
    inclinationDeg: 166.9,
    ascendingNodeDeg: 353.4,
    periodDays: 1048.4188,
    apsisPrecessionYears: 215.1,
    nodePrecessionYears: 400.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 281,
    planet: "Saturn",
    name: "S2019_S37",
    iauCode: "65194",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19996900,
    e: 0.404,
    argPeriapsisDeg: 355.3,
    meanAnomalyDeg: 135.8,
    inclinationDeg: 149.9,
    ascendingNodeDeg: 273.4,
    periodDays: 1055.7771,
    apsisPrecessionYears: 256.7,
    nodePrecessionYears: 346.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 282,
    planet: "Saturn",
    name: "S2019_S38",
    iauCode: "65195",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21998400,
    e: 0.399,
    argPeriapsisDeg: 303.7,
    meanAnomalyDeg: 138.3,
    inclinationDeg: 163,
    ascendingNodeDeg: 216.6,
    periodDays: 1218.2743,
    apsisPrecessionYears: 176.5,
    nodePrecessionYears: 277.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 283,
    planet: "Saturn",
    name: "S2019_S39",
    iauCode: "65196",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23784500,
    e: 0.098,
    argPeriapsisDeg: 327,
    meanAnomalyDeg: 92.5,
    inclinationDeg: 174.5,
    ascendingNodeDeg: 273.1,
    periodDays: 1369.6437,
    apsisPrecessionYears: 149.5,
    nodePrecessionYears: 293.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 284,
    planet: "Saturn",
    name: "S2019_S40",
    iauCode: "65197",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 24087800,
    e: 0.088,
    argPeriapsisDeg: 242.4,
    meanAnomalyDeg: 347.6,
    inclinationDeg: 161.8,
    ascendingNodeDeg: 44.4,
    periodDays: 1395.8771,
    apsisPrecessionYears: 165.8,
    nodePrecessionYears: 303.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 285,
    planet: "Saturn",
    name: "S2019_S41",
    iauCode: "65198",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 24493600,
    e: 0.257,
    argPeriapsisDeg: 40,
    meanAnomalyDeg: 320.7,
    inclinationDeg: 157.1,
    ascendingNodeDeg: 11.4,
    periodDays: 1431.2979,
    apsisPrecessionYears: 166.7,
    nodePrecessionYears: 272.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 286,
    planet: "Saturn",
    name: "S2019_S42",
    iauCode: "65199",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 24111600,
    e: 0.121,
    argPeriapsisDeg: 84.5,
    meanAnomalyDeg: 351.4,
    inclinationDeg: 163.2,
    ascendingNodeDeg: 318.2,
    periodDays: 1397.975,
    apsisPrecessionYears: 172.4,
    nodePrecessionYears: 317.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 287,
    planet: "Saturn",
    name: "S2019_S43",
    iauCode: "65200",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 26664100,
    e: 0.277,
    argPeriapsisDeg: 108.2,
    meanAnomalyDeg: 306.2,
    inclinationDeg: 165.3,
    ascendingNodeDeg: 116,
    periodDays: 1625.9,
    apsisPrecessionYears: 131.4,
    nodePrecessionYears: 228.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 288,
    planet: "Saturn",
    name: "S2019_S44",
    iauCode: "65201",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 26796900,
    e: 0.512,
    argPeriapsisDeg: 332.7,
    meanAnomalyDeg: 330.6,
    inclinationDeg: 172.6,
    ascendingNodeDeg: 223,
    periodDays: 1638.1104,
    apsisPrecessionYears: 111.3,
    nodePrecessionYears: 168.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 289,
    planet: "Saturn",
    name: "S2020_S11",
    iauCode: "65202",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11295600,
    e: 0.372,
    argPeriapsisDeg: 110.4,
    meanAnomalyDeg: 95.9,
    inclinationDeg: 48.2,
    ascendingNodeDeg: 94.2,
    periodDays: 448.2111,
    apsisPrecessionYears: 1293.2,
    nodePrecessionYears: 1093,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 290,
    planet: "Saturn",
    name: "S2020_S12",
    iauCode: "65203",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11314500,
    e: 0.26,
    argPeriapsisDeg: 81.2,
    meanAnomalyDeg: 350.8,
    inclinationDeg: 50.8,
    ascendingNodeDeg: 70.5,
    periodDays: 449.3271,
    apsisPrecessionYears: 1707.3,
    nodePrecessionYears: 1306.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 291,
    planet: "Saturn",
    name: "S2020_S13",
    iauCode: "65204",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11415600,
    e: 0.373,
    argPeriapsisDeg: 96.4,
    meanAnomalyDeg: 230.4,
    inclinationDeg: 48,
    ascendingNodeDeg: 41.6,
    periodDays: 455.3875,
    apsisPrecessionYears: 1248.6,
    nodePrecessionYears: 1064.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 292,
    planet: "Saturn",
    name: "S2020_S14",
    iauCode: "65205",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16186200,
    e: 0.313,
    argPeriapsisDeg: 54.7,
    meanAnomalyDeg: 209.3,
    inclinationDeg: 161.7,
    ascendingNodeDeg: 355.4,
    periodDays: 768.8625,
    apsisPrecessionYears: 285.5,
    nodePrecessionYears: 472.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 293,
    planet: "Saturn",
    name: "S2020_S15",
    iauCode: "65206",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16729200,
    e: 0.462,
    argPeriapsisDeg: 275.8,
    meanAnomalyDeg: 141.7,
    inclinationDeg: 37.1,
    ascendingNodeDeg: 338.2,
    periodDays: 807.8243,
    apsisPrecessionYears: 394.2,
    nodePrecessionYears: 448.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 294,
    planet: "Saturn",
    name: "S2020_S16",
    iauCode: "65207",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16963400,
    e: 0.405,
    argPeriapsisDeg: 73.1,
    meanAnomalyDeg: 185.2,
    inclinationDeg: 167.3,
    ascendingNodeDeg: 268.6,
    periodDays: 824.9229,
    apsisPrecessionYears: 243,
    nodePrecessionYears: 392.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 295,
    planet: "Saturn",
    name: "S2020_S17",
    iauCode: "65208",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17094200,
    e: 0.378,
    argPeriapsisDeg: 287.2,
    meanAnomalyDeg: 359,
    inclinationDeg: 148.9,
    ascendingNodeDeg: 210.9,
    periodDays: 834.4472,
    apsisPrecessionYears: 330.3,
    nodePrecessionYears: 446.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 296,
    planet: "Saturn",
    name: "S2020_S18",
    iauCode: "65209",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17777900,
    e: 0.18,
    argPeriapsisDeg: 165.9,
    meanAnomalyDeg: 218.7,
    inclinationDeg: 168.9,
    ascendingNodeDeg: 204,
    periodDays: 885.1153,
    apsisPrecessionYears: 247.4,
    nodePrecessionYears: 462.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 297,
    planet: "Saturn",
    name: "S2020_S19",
    iauCode: "65210",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17726700,
    e: 0.159,
    argPeriapsisDeg: 65.5,
    meanAnomalyDeg: 80.4,
    inclinationDeg: 48.1,
    ascendingNodeDeg: 56.1,
    periodDays: 881.0431,
    apsisPrecessionYears: 762.4,
    nodePrecessionYears: 689.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 298,
    planet: "Saturn",
    name: "S2020_S20",
    iauCode: "65211",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17997300,
    e: 0.133,
    argPeriapsisDeg: 230.5,
    meanAnomalyDeg: 330,
    inclinationDeg: 169.8,
    ascendingNodeDeg: 92.9,
    periodDays: 901.525,
    apsisPrecessionYears: 238.2,
    nodePrecessionYears: 455.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 299,
    planet: "Saturn",
    name: "S2020_S21",
    iauCode: "65212",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18862100,
    e: 0.307,
    argPeriapsisDeg: 188,
    meanAnomalyDeg: 95.5,
    inclinationDeg: 169.9,
    ascendingNodeDeg: 328.3,
    periodDays: 967.2604,
    apsisPrecessionYears: 210.6,
    nodePrecessionYears: 369.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 300,
    planet: "Saturn",
    name: "S2020_S22",
    iauCode: "65213",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19443e3,
    e: 0.059,
    argPeriapsisDeg: 38.4,
    meanAnomalyDeg: 128.8,
    inclinationDeg: 161.3,
    ascendingNodeDeg: 271.4,
    periodDays: 1012.241,
    apsisPrecessionYears: 240.6,
    nodePrecessionYears: 440.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 301,
    planet: "Saturn",
    name: "S2020_S23",
    iauCode: "65214",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19801500,
    e: 0.089,
    argPeriapsisDeg: 61.5,
    meanAnomalyDeg: 65.1,
    inclinationDeg: 165,
    ascendingNodeDeg: 153.6,
    periodDays: 1040.3757,
    apsisPrecessionYears: 218.2,
    nodePrecessionYears: 410,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 302,
    planet: "Saturn",
    name: "S2020_S24",
    iauCode: "65215",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20618300,
    e: 0.23,
    argPeriapsisDeg: 114.8,
    meanAnomalyDeg: 301.4,
    inclinationDeg: 159.6,
    ascendingNodeDeg: 42.2,
    periodDays: 1105.4083,
    apsisPrecessionYears: 217.4,
    nodePrecessionYears: 370.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 303,
    planet: "Saturn",
    name: "S2020_S25",
    iauCode: "65216",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20763700,
    e: 0.316,
    argPeriapsisDeg: 329,
    meanAnomalyDeg: 318.1,
    inclinationDeg: 171.8,
    ascendingNodeDeg: 242.2,
    periodDays: 1117.0889,
    apsisPrecessionYears: 174,
    nodePrecessionYears: 305.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 304,
    planet: "Saturn",
    name: "S2020_S26",
    iauCode: "65217",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21264400,
    e: 0.273,
    argPeriapsisDeg: 143,
    meanAnomalyDeg: 141.3,
    inclinationDeg: 163.2,
    ascendingNodeDeg: 252.9,
    periodDays: 1157.766,
    apsisPrecessionYears: 196.8,
    nodePrecessionYears: 338.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 305,
    planet: "Saturn",
    name: "S2020_S27",
    iauCode: "65218",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21802300,
    e: 0.255,
    argPeriapsisDeg: 314.6,
    meanAnomalyDeg: 32,
    inclinationDeg: 145.3,
    ascendingNodeDeg: 324.5,
    periodDays: 1202.016,
    apsisPrecessionYears: 278.1,
    nodePrecessionYears: 377,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 306,
    planet: "Saturn",
    name: "S2020_S28",
    iauCode: "65219",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21993700,
    e: 0.474,
    argPeriapsisDeg: 226.7,
    meanAnomalyDeg: 2.2,
    inclinationDeg: 160.1,
    ascendingNodeDeg: 60.9,
    periodDays: 1217.8104,
    apsisPrecessionYears: 173.6,
    nodePrecessionYears: 251.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 307,
    planet: "Saturn",
    name: "S2020_S29",
    iauCode: "65220",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22301400,
    e: 0.047,
    argPeriapsisDeg: 298.7,
    meanAnomalyDeg: 115.9,
    inclinationDeg: 169.1,
    ascendingNodeDeg: 255.9,
    periodDays: 1243.4493,
    apsisPrecessionYears: 181.9,
    nodePrecessionYears: 353.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 308,
    planet: "Saturn",
    name: "S2020_S30",
    iauCode: "65221",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21790700,
    e: 0.601,
    argPeriapsisDeg: 352.3,
    meanAnomalyDeg: 60.3,
    inclinationDeg: 154.2,
    ascendingNodeDeg: 132.1,
    periodDays: 1201.0187,
    apsisPrecessionYears: 163.9,
    nodePrecessionYears: 201.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 309,
    planet: "Saturn",
    name: "S2020_S31",
    iauCode: "65222",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22457300,
    e: 0.238,
    argPeriapsisDeg: 196.2,
    meanAnomalyDeg: 0.1,
    inclinationDeg: 163.8,
    ascendingNodeDeg: 148.1,
    periodDays: 1256.5035,
    apsisPrecessionYears: 175.5,
    nodePrecessionYears: 309,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 310,
    planet: "Saturn",
    name: "S2020_S32",
    iauCode: "65223",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21884100,
    e: 0.502,
    argPeriapsisDeg: 198.2,
    meanAnomalyDeg: 88.9,
    inclinationDeg: 169.1,
    ascendingNodeDeg: 351.6,
    periodDays: 1208.8486,
    apsisPrecessionYears: 150.1,
    nodePrecessionYears: 226,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 311,
    planet: "Saturn",
    name: "S2020_S33",
    iauCode: "65224",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22922500,
    e: 0.555,
    argPeriapsisDeg: 4.3,
    meanAnomalyDeg: 165.2,
    inclinationDeg: 162.8,
    ascendingNodeDeg: 161.7,
    periodDays: 1295.85,
    apsisPrecessionYears: 147,
    nodePrecessionYears: 203.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 312,
    planet: "Saturn",
    name: "S2020_S34",
    iauCode: "65225",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22435600,
    e: 0.154,
    argPeriapsisDeg: 162.8,
    meanAnomalyDeg: 116.4,
    inclinationDeg: 160.6,
    ascendingNodeDeg: 7.7,
    periodDays: 1254.6069,
    apsisPrecessionYears: 196.1,
    nodePrecessionYears: 348.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 313,
    planet: "Saturn",
    name: "S2020_S35",
    iauCode: "65226",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23030300,
    e: 0.225,
    argPeriapsisDeg: 19.8,
    meanAnomalyDeg: 98,
    inclinationDeg: 174.9,
    ascendingNodeDeg: 344.7,
    periodDays: 1304.9653,
    apsisPrecessionYears: 150.7,
    nodePrecessionYears: 282,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 314,
    planet: "Saturn",
    name: "S2020_S36",
    iauCode: "65227",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22806200,
    e: 0.336,
    argPeriapsisDeg: 139.7,
    meanAnomalyDeg: 216.1,
    inclinationDeg: 168.8,
    ascendingNodeDeg: 26.9,
    periodDays: 1286.0292,
    apsisPrecessionYears: 164,
    nodePrecessionYears: 280.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 315,
    planet: "Saturn",
    name: "S2020_S37",
    iauCode: "65228",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23751800,
    e: 0.344,
    argPeriapsisDeg: 211.7,
    meanAnomalyDeg: 182.3,
    inclinationDeg: 174.8,
    ascendingNodeDeg: 25.1,
    periodDays: 1366.8215,
    apsisPrecessionYears: 145.4,
    nodePrecessionYears: 252.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 316,
    planet: "Saturn",
    name: "S2020_S38",
    iauCode: "65229",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23583900,
    e: 0.513,
    argPeriapsisDeg: 246.3,
    meanAnomalyDeg: 99.4,
    inclinationDeg: 159.7,
    ascendingNodeDeg: 284,
    periodDays: 1352.4347,
    apsisPrecessionYears: 142.2,
    nodePrecessionYears: 199.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 317,
    planet: "Saturn",
    name: "S2020_S39",
    iauCode: "65230",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 24262400,
    e: 0.305,
    argPeriapsisDeg: 28.9,
    meanAnomalyDeg: 165.2,
    inclinationDeg: 160.1,
    ascendingNodeDeg: 318.8,
    periodDays: 1411.1451,
    apsisPrecessionYears: 164.6,
    nodePrecessionYears: 269.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 318,
    planet: "Saturn",
    name: "S2020_S40",
    iauCode: "65231",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23785900,
    e: 0.412,
    argPeriapsisDeg: 99.4,
    meanAnomalyDeg: 64,
    inclinationDeg: 167.3,
    ascendingNodeDeg: 250.5,
    periodDays: 1369.7562,
    apsisPrecessionYears: 135.3,
    nodePrecessionYears: 217,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 319,
    planet: "Saturn",
    name: "S2020_S41",
    iauCode: "65232",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 25876400,
    e: 0.402,
    argPeriapsisDeg: 224.9,
    meanAnomalyDeg: 63.1,
    inclinationDeg: 160.2,
    ascendingNodeDeg: 28.3,
    periodDays: 1554.3993,
    apsisPrecessionYears: 142.1,
    nodePrecessionYears: 218.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 320,
    planet: "Saturn",
    name: "S2020_S42",
    iauCode: "65233",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 25329400,
    e: 0.506,
    argPeriapsisDeg: 59.1,
    meanAnomalyDeg: 278.4,
    inclinationDeg: 157.5,
    ascendingNodeDeg: 15.4,
    periodDays: 1505.3118,
    apsisPrecessionYears: 128.1,
    nodePrecessionYears: 176.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 321,
    planet: "Saturn",
    name: "S2020_S43",
    iauCode: "65234",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 26657400,
    e: 0.203,
    argPeriapsisDeg: 257,
    meanAnomalyDeg: 252.6,
    inclinationDeg: 164.6,
    ascendingNodeDeg: 68.7,
    periodDays: 1625.2931,
    apsisPrecessionYears: 131.5,
    nodePrecessionYears: 236.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 322,
    planet: "Saturn",
    name: "S2020_S44",
    iauCode: "65235",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 27259400,
    e: 0.199,
    argPeriapsisDeg: 283.8,
    meanAnomalyDeg: 318,
    inclinationDeg: 168.5,
    ascendingNodeDeg: 28,
    periodDays: 1680.641,
    apsisPrecessionYears: 136.5,
    nodePrecessionYears: 252.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 323,
    planet: "Saturn",
    name: "S2023_S01",
    iauCode: "65236",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11205400,
    e: 0.386,
    argPeriapsisDeg: 296.8,
    meanAnomalyDeg: 263.4,
    inclinationDeg: 48.8,
    ascendingNodeDeg: 159.6,
    periodDays: 442.8632,
    apsisPrecessionYears: 1336.6,
    nodePrecessionYears: 1092.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 324,
    planet: "Saturn",
    name: "S2023_S02",
    iauCode: "65237",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11309900,
    e: 0.339,
    argPeriapsisDeg: 117.3,
    meanAnomalyDeg: 257.2,
    inclinationDeg: 45.7,
    ascendingNodeDeg: 253.8,
    periodDays: 449.0535,
    apsisPrecessionYears: 1136.4,
    nodePrecessionYears: 1079.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 325,
    planet: "Saturn",
    name: "S2023_S03",
    iauCode: "65238",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17646400,
    e: 0.178,
    argPeriapsisDeg: 264,
    meanAnomalyDeg: 272.6,
    inclinationDeg: 46.9,
    ascendingNodeDeg: 93.7,
    periodDays: 875.0007,
    apsisPrecessionYears: 688.6,
    nodePrecessionYears: 657.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 326,
    planet: "Saturn",
    name: "S2023_S04",
    iauCode: "65239",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17764600,
    e: 0.276,
    argPeriapsisDeg: 9.5,
    meanAnomalyDeg: 123.9,
    inclinationDeg: 170,
    ascendingNodeDeg: 264.4,
    periodDays: 884.1111,
    apsisPrecessionYears: 235,
    nodePrecessionYears: 420.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 327,
    planet: "Saturn",
    name: "S2023_S05",
    iauCode: "65240",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 25583500,
    e: 0.599,
    argPeriapsisDeg: 94.9,
    meanAnomalyDeg: 334.2,
    inclinationDeg: 168.8,
    ascendingNodeDeg: 235,
    periodDays: 1528.0368,
    apsisPrecessionYears: 111,
    nodePrecessionYears: 153.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 328,
    planet: "Saturn",
    name: "S2023_S06",
    iauCode: "65241",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11953100,
    e: 0.336,
    argPeriapsisDeg: 103.7,
    meanAnomalyDeg: 133.4,
    inclinationDeg: 47.4,
    ascendingNodeDeg: 54.4,
    periodDays: 487.909,
    apsisPrecessionYears: 1170.5,
    nodePrecessionYears: 1036.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 329,
    planet: "Saturn",
    name: "S2023_S07",
    iauCode: "65242",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 12133700,
    e: 0.284,
    argPeriapsisDeg: 102.5,
    meanAnomalyDeg: 102.3,
    inclinationDeg: 44.7,
    ascendingNodeDeg: 289.7,
    periodDays: 499.0097,
    apsisPrecessionYears: 1009.6,
    nodePrecessionYears: 1016.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 330,
    planet: "Saturn",
    name: "S2023_S08",
    iauCode: "65243",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 14018800,
    e: 0.122,
    argPeriapsisDeg: 278.8,
    meanAnomalyDeg: 149.6,
    inclinationDeg: 166.9,
    ascendingNodeDeg: 240.1,
    periodDays: 619.691,
    apsisPrecessionYears: 359.4,
    nodePrecessionYears: 678.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 331,
    planet: "Saturn",
    name: "S2023_S09",
    iauCode: "65244",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 13167500,
    e: 0.141,
    argPeriapsisDeg: 209.8,
    meanAnomalyDeg: 285.2,
    inclinationDeg: 172.2,
    ascendingNodeDeg: 324.8,
    periodDays: 564.1139,
    apsisPrecessionYears: 375.5,
    nodePrecessionYears: 722.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 332,
    planet: "Saturn",
    name: "S2023_S10",
    iauCode: "65245",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 15500200,
    e: 0.302,
    argPeriapsisDeg: 124.7,
    meanAnomalyDeg: 70.9,
    inclinationDeg: 163,
    ascendingNodeDeg: 308.1,
    periodDays: 720.4931,
    apsisPrecessionYears: 302.7,
    nodePrecessionYears: 510.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 333,
    planet: "Saturn",
    name: "S2023_S11",
    iauCode: "65246",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 14046100,
    e: 0.3,
    argPeriapsisDeg: 76.1,
    meanAnomalyDeg: 334.2,
    inclinationDeg: 170.9,
    ascendingNodeDeg: 193,
    periodDays: 621.4931,
    apsisPrecessionYears: 328.3,
    nodePrecessionYears: 580.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 334,
    planet: "Saturn",
    name: "S2023_S12",
    iauCode: "65247",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 15805900,
    e: 0.601,
    argPeriapsisDeg: 182.5,
    meanAnomalyDeg: 339.7,
    inclinationDeg: 168.8,
    ascendingNodeDeg: 301,
    periodDays: 741.9167,
    apsisPrecessionYears: 215.8,
    nodePrecessionYears: 297.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 335,
    planet: "Saturn",
    name: "S2023_S13",
    iauCode: "65248",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 15193e3,
    e: 0.179,
    argPeriapsisDeg: 107.5,
    meanAnomalyDeg: 173.9,
    inclinationDeg: 168.5,
    ascendingNodeDeg: 134.2,
    periodDays: 699.1799,
    apsisPrecessionYears: 313.7,
    nodePrecessionYears: 585.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 336,
    planet: "Saturn",
    name: "S2023_S14",
    iauCode: "65249",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 16853e3,
    e: 0.497,
    argPeriapsisDeg: 351.4,
    meanAnomalyDeg: 62.7,
    inclinationDeg: 171.6,
    ascendingNodeDeg: 291.7,
    periodDays: 816.8618,
    apsisPrecessionYears: 219.4,
    nodePrecessionYears: 335,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 337,
    planet: "Saturn",
    name: "S2023_S15",
    iauCode: "65250",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18241300,
    e: 0.549,
    argPeriapsisDeg: 123.2,
    meanAnomalyDeg: 159.7,
    inclinationDeg: 161.9,
    ascendingNodeDeg: 276.6,
    periodDays: 919.9347,
    apsisPrecessionYears: 196.5,
    nodePrecessionYears: 271.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 338,
    planet: "Saturn",
    name: "S2023_S16",
    iauCode: "65251",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17005300,
    e: 0.27,
    argPeriapsisDeg: 116.9,
    meanAnomalyDeg: 80,
    inclinationDeg: 162.6,
    ascendingNodeDeg: 270.6,
    periodDays: 827.9111,
    apsisPrecessionYears: 273,
    nodePrecessionYears: 467.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 339,
    planet: "Saturn",
    name: "S2023_S17",
    iauCode: "65252",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17385300,
    e: 0.498,
    argPeriapsisDeg: 246.7,
    meanAnomalyDeg: 128.1,
    inclinationDeg: 35.9,
    ascendingNodeDeg: 240.7,
    periodDays: 855.9354,
    apsisPrecessionYears: 332.5,
    nodePrecessionYears: 378,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 340,
    planet: "Saturn",
    name: "S2023_S18",
    iauCode: "65253",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17381700,
    e: 0.448,
    argPeriapsisDeg: 280,
    meanAnomalyDeg: 169.7,
    inclinationDeg: 36.7,
    ascendingNodeDeg: 78.1,
    periodDays: 855.6535,
    apsisPrecessionYears: 373,
    nodePrecessionYears: 432.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 341,
    planet: "Saturn",
    name: "S2023_S19",
    iauCode: "65254",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17590300,
    e: 0.092,
    argPeriapsisDeg: 205.4,
    meanAnomalyDeg: 325.5,
    inclinationDeg: 48.2,
    ascendingNodeDeg: 50.1,
    periodDays: 870.9229,
    apsisPrecessionYears: 778.5,
    nodePrecessionYears: 709.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 342,
    planet: "Saturn",
    name: "S2023_S20",
    iauCode: "65255",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17261e3,
    e: 0.442,
    argPeriapsisDeg: 322.1,
    meanAnomalyDeg: 200.6,
    inclinationDeg: 136.5,
    ascendingNodeDeg: 112.7,
    periodDays: 846.7653,
    apsisPrecessionYears: 490.3,
    nodePrecessionYears: 476.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 343,
    planet: "Saturn",
    name: "S2023_S21",
    iauCode: "65256",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 17755400,
    e: 0.077,
    argPeriapsisDeg: 341.9,
    meanAnomalyDeg: 38.7,
    inclinationDeg: 157.3,
    ascendingNodeDeg: 124.2,
    periodDays: 883.3083,
    apsisPrecessionYears: 291.9,
    nodePrecessionYears: 511.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 344,
    planet: "Saturn",
    name: "S2023_S22",
    iauCode: "65257",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18577500,
    e: 0.182,
    argPeriapsisDeg: 266.5,
    meanAnomalyDeg: 4.2,
    inclinationDeg: 47.5,
    ascendingNodeDeg: 121.8,
    periodDays: 945.3701,
    apsisPrecessionYears: 669.1,
    nodePrecessionYears: 620.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 345,
    planet: "Saturn",
    name: "S2023_S23",
    iauCode: "65258",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18783700,
    e: 0.35,
    argPeriapsisDeg: 91.2,
    meanAnomalyDeg: 81.8,
    inclinationDeg: 164.8,
    ascendingNodeDeg: 187,
    periodDays: 961.2236,
    apsisPrecessionYears: 223.2,
    nodePrecessionYears: 369.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 346,
    planet: "Saturn",
    name: "S2023_S24",
    iauCode: "65259",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18351800,
    e: 0.374,
    argPeriapsisDeg: 319.7,
    meanAnomalyDeg: 54.4,
    inclinationDeg: 169.7,
    ascendingNodeDeg: 1.4,
    periodDays: 928.2451,
    apsisPrecessionYears: 214.2,
    nodePrecessionYears: 358,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 347,
    planet: "Saturn",
    name: "S2023_S25",
    iauCode: "65260",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19136600,
    e: 0.281,
    argPeriapsisDeg: 293.8,
    meanAnomalyDeg: 186.2,
    inclinationDeg: 166.4,
    ascendingNodeDeg: 216.6,
    periodDays: 988.5278,
    apsisPrecessionYears: 210.2,
    nodePrecessionYears: 367.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 348,
    planet: "Saturn",
    name: "S2023_S26",
    iauCode: "65261",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19894300,
    e: 0.306,
    argPeriapsisDeg: 108.2,
    meanAnomalyDeg: 132.2,
    inclinationDeg: 163.9,
    ascendingNodeDeg: 147.4,
    periodDays: 1047.7618,
    apsisPrecessionYears: 204.1,
    nodePrecessionYears: 345.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 349,
    planet: "Saturn",
    name: "S2023_S27",
    iauCode: "65262",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19820100,
    e: 0.652,
    argPeriapsisDeg: 117,
    meanAnomalyDeg: 91.2,
    inclinationDeg: 151.1,
    ascendingNodeDeg: 306.6,
    periodDays: 1041.8521,
    apsisPrecessionYears: 192.5,
    nodePrecessionYears: 218.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 350,
    planet: "Saturn",
    name: "S2023_S28",
    iauCode: "65263",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19881e3,
    e: 0.575,
    argPeriapsisDeg: 2.3,
    meanAnomalyDeg: 189.6,
    inclinationDeg: 168.7,
    ascendingNodeDeg: 59.6,
    periodDays: 1046.5556,
    apsisPrecessionYears: 159.7,
    nodePrecessionYears: 225.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 351,
    planet: "Saturn",
    name: "S2023_S29",
    iauCode: "65264",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20042400,
    e: 0.141,
    argPeriapsisDeg: 47,
    meanAnomalyDeg: 162.8,
    inclinationDeg: 172.2,
    ascendingNodeDeg: 227.4,
    periodDays: 1059.4208,
    apsisPrecessionYears: 198.7,
    nodePrecessionYears: 382.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 352,
    planet: "Saturn",
    name: "S2023_S30",
    iauCode: "65265",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 18238300,
    e: 0.493,
    argPeriapsisDeg: 191.3,
    meanAnomalyDeg: 2.7,
    inclinationDeg: 142.4,
    ascendingNodeDeg: 250,
    periodDays: 919.7139,
    apsisPrecessionYears: 330.6,
    nodePrecessionYears: 364.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 353,
    planet: "Saturn",
    name: "S2023_S31",
    iauCode: "65266",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20729200,
    e: 0.182,
    argPeriapsisDeg: 240.9,
    meanAnomalyDeg: 308.7,
    inclinationDeg: 163,
    ascendingNodeDeg: 261.1,
    periodDays: 1114.2889,
    apsisPrecessionYears: 212.9,
    nodePrecessionYears: 382.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 354,
    planet: "Saturn",
    name: "S2023_S32",
    iauCode: "65267",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20454400,
    e: 0.037,
    argPeriapsisDeg: 90.3,
    meanAnomalyDeg: 30,
    inclinationDeg: 169.8,
    ascendingNodeDeg: 195.2,
    periodDays: 1092.2417,
    apsisPrecessionYears: 205.3,
    nodePrecessionYears: 400.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 355,
    planet: "Saturn",
    name: "S2023_S33",
    iauCode: "65268",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21621900,
    e: 0.665,
    argPeriapsisDeg: 258.6,
    meanAnomalyDeg: 49.1,
    inclinationDeg: 155.8,
    ascendingNodeDeg: 209.3,
    periodDays: 1187.0667,
    apsisPrecessionYears: 147.2,
    nodePrecessionYears: 174.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 356,
    planet: "Saturn",
    name: "S2023_S34",
    iauCode: "65269",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20803900,
    e: 0.57,
    argPeriapsisDeg: 275.5,
    meanAnomalyDeg: 293.6,
    inclinationDeg: 168.4,
    ascendingNodeDeg: 303,
    periodDays: 1120.3833,
    apsisPrecessionYears: 149.4,
    nodePrecessionYears: 211.4,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 357,
    planet: "Saturn",
    name: "S2023_S35",
    iauCode: "65270",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22269700,
    e: 0.151,
    argPeriapsisDeg: 165.5,
    meanAnomalyDeg: 92.9,
    inclinationDeg: 168.5,
    ascendingNodeDeg: 340.9,
    periodDays: 1240.7618,
    apsisPrecessionYears: 174.8,
    nodePrecessionYears: 329.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 358,
    planet: "Saturn",
    name: "S2023_S36",
    iauCode: "65271",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22230600,
    e: 0.359,
    argPeriapsisDeg: 157,
    meanAnomalyDeg: 312.2,
    inclinationDeg: 166.3,
    ascendingNodeDeg: 325.1,
    periodDays: 1237.6104,
    apsisPrecessionYears: 162.7,
    nodePrecessionYears: 270,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 359,
    planet: "Saturn",
    name: "S2023_S37",
    iauCode: "65272",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19889800,
    e: 0.215,
    argPeriapsisDeg: 241.2,
    meanAnomalyDeg: 244.7,
    inclinationDeg: 172.3,
    ascendingNodeDeg: 63.4,
    periodDays: 1047.3903,
    apsisPrecessionYears: 204.5,
    nodePrecessionYears: 381.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 360,
    planet: "Saturn",
    name: "S2023_S38",
    iauCode: "65273",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 12823500,
    e: 0.909,
    argPeriapsisDeg: 241.2,
    meanAnomalyDeg: 244.7,
    inclinationDeg: 149.2,
    ascendingNodeDeg: 63.4,
    periodDays: 546.3146,
    apsisPrecessionYears: 280.4,
    nodePrecessionYears: 256.1,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 361,
    planet: "Saturn",
    name: "S2023_S39",
    iauCode: "65274",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20824500,
    e: 0.124,
    argPeriapsisDeg: 351.9,
    meanAnomalyDeg: 345.1,
    inclinationDeg: 164.8,
    ascendingNodeDeg: 118.3,
    periodDays: 1121.9938,
    apsisPrecessionYears: 209.2,
    nodePrecessionYears: 389,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 362,
    planet: "Saturn",
    name: "S2023_S40",
    iauCode: "65275",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21065100,
    e: 0.342,
    argPeriapsisDeg: 334.7,
    meanAnomalyDeg: 3.6,
    inclinationDeg: 169.6,
    ascendingNodeDeg: 271.4,
    periodDays: 1141.4813,
    apsisPrecessionYears: 169.5,
    nodePrecessionYears: 289.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 363,
    planet: "Saturn",
    name: "S2023_S41",
    iauCode: "65276",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21286400,
    e: 0.279,
    argPeriapsisDeg: 323,
    meanAnomalyDeg: 29.1,
    inclinationDeg: 172.1,
    ascendingNodeDeg: 7.2,
    periodDays: 1159.516,
    apsisPrecessionYears: 174.8,
    nodePrecessionYears: 314.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 364,
    planet: "Saturn",
    name: "S2023_S42",
    iauCode: "65277",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21837e3,
    e: 0.059,
    argPeriapsisDeg: 33.2,
    meanAnomalyDeg: 315.9,
    inclinationDeg: 166.7,
    ascendingNodeDeg: 355.1,
    periodDays: 1204.8146,
    apsisPrecessionYears: 191,
    nodePrecessionYears: 365,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 365,
    planet: "Saturn",
    name: "S2023_S43",
    iauCode: "65278",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 22563900,
    e: 0.264,
    argPeriapsisDeg: 218,
    meanAnomalyDeg: 92.7,
    inclinationDeg: 170.3,
    ascendingNodeDeg: 247.3,
    periodDays: 1265.5667,
    apsisPrecessionYears: 164.6,
    nodePrecessionYears: 296.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 366,
    planet: "Saturn",
    name: "S2023_S44",
    iauCode: "65279",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 19292400,
    e: 0.434,
    argPeriapsisDeg: 166.3,
    meanAnomalyDeg: 232.9,
    inclinationDeg: 167.4,
    ascendingNodeDeg: 179.9,
    periodDays: 1000.4722,
    apsisPrecessionYears: 191.2,
    nodePrecessionYears: 301.7,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 367,
    planet: "Saturn",
    name: "S2023_S45",
    iauCode: "65280",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 23438400,
    e: 0.633,
    argPeriapsisDeg: 334.1,
    meanAnomalyDeg: 336.8,
    inclinationDeg: 157.4,
    ascendingNodeDeg: 102.2,
    periodDays: 1339.8472,
    apsisPrecessionYears: 134.1,
    nodePrecessionYears: 166.2,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 368,
    planet: "Saturn",
    name: "S2023_S46",
    iauCode: "65281",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 24708900,
    e: 0.336,
    argPeriapsisDeg: 100.4,
    meanAnomalyDeg: 230,
    inclinationDeg: 143.2,
    ascendingNodeDeg: 306.8,
    periodDays: 1450.2715,
    apsisPrecessionYears: 229.9,
    nodePrecessionYears: 284.5,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 369,
    planet: "Saturn",
    name: "S2023_S47",
    iauCode: "65282",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 25102300,
    e: 0.101,
    argPeriapsisDeg: 257.3,
    meanAnomalyDeg: 97.5,
    inclinationDeg: 162.5,
    ascendingNodeDeg: 208.4,
    periodDays: 1485.0417,
    apsisPrecessionYears: 153.8,
    nodePrecessionYears: 282.6,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 370,
    planet: "Saturn",
    name: "S2023_S48",
    iauCode: "65283",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 20029200,
    e: 0.022,
    argPeriapsisDeg: 108.2,
    meanAnomalyDeg: 315.6,
    inclinationDeg: 169.7,
    ascendingNodeDeg: 338.7,
    periodDays: 1058.3493,
    apsisPrecessionYears: 212.7,
    nodePrecessionYears: 414.8,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 371,
    planet: "Saturn",
    name: "S2023_S49",
    iauCode: "65284",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 21766500,
    e: 0.026,
    argPeriapsisDeg: 110.7,
    meanAnomalyDeg: 82.5,
    inclinationDeg: 171.7,
    ascendingNodeDeg: 193.8,
    periodDays: 1198.9896,
    apsisPrecessionYears: 179.6,
    nodePrecessionYears: 353.3,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 372,
    planet: "Saturn",
    name: "S2023_S50",
    iauCode: "65285",
    ephemeris: "SAT455",
    frame: "ecliptic",
    epochTdb: "2000-01-01.5",
    aKm: 11656500,
    e: 0.263,
    argPeriapsisDeg: 326.3,
    meanAnomalyDeg: 79.8,
    inclinationDeg: 166.1,
    ascendingNodeDeg: 29,
    periodDays: 469.8201,
    apsisPrecessionYears: 461.2,
    nodePrecessionYears: 813.9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "46"
  },
  {
    id: 373,
    planet: "Uranus",
    name: "Ariel",
    iauCode: "701",
    ephemeris: "URA182",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 190929,
    e: 1e-3,
    argPeriapsisDeg: 9.6,
    meanAnomalyDeg: 193.5,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 2.520379,
    apsisPrecessionYears: 28.901,
    nodePrecessionYears: 0,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "45"
  },
  {
    id: 374,
    planet: "Uranus",
    name: "Umbriel",
    iauCode: "702",
    ephemeris: "URA182",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 265986,
    e: 4e-3,
    argPeriapsisDeg: 183.4,
    meanAnomalyDeg: 253,
    inclinationDeg: 0.1,
    ascendingNodeDeg: 174.8,
    periodDays: 4.144177,
    apsisPrecessionYears: 64.126,
    nodePrecessionYears: 129.745,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "45"
  },
  {
    id: 375,
    planet: "Uranus",
    name: "Titania",
    iauCode: "703",
    ephemeris: "URA182",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 436298,
    e: 2e-3,
    argPeriapsisDeg: 184,
    meanAnomalyDeg: 68.1,
    inclinationDeg: 0.1,
    ascendingNodeDeg: 29.5,
    periodDays: 8.705869,
    apsisPrecessionYears: 579.928,
    nodePrecessionYears: 1644.649,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "45"
  },
  {
    id: 376,
    planet: "Uranus",
    name: "Oberon",
    iauCode: "704",
    ephemeris: "URA182",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 583511,
    e: 2e-3,
    argPeriapsisDeg: 132.2,
    meanAnomalyDeg: 143.6,
    inclinationDeg: 0.1,
    ascendingNodeDeg: 76.8,
    periodDays: 13.463237,
    apsisPrecessionYears: 158.604,
    nodePrecessionYears: 192.798,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "45"
  },
  {
    id: 377,
    planet: "Uranus",
    name: "Miranda",
    iauCode: "705",
    ephemeris: "URA182",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 129846,
    e: 1e-3,
    argPeriapsisDeg: 154.8,
    meanAnomalyDeg: 73,
    inclinationDeg: 4.4,
    ascendingNodeDeg: 100.9,
    periodDays: 1.413479,
    apsisPrecessionYears: 8.939,
    nodePrecessionYears: 17.787,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "45"
  },
  {
    id: 378,
    planet: "Uranus",
    name: "Puck",
    iauCode: "715",
    ephemeris: "URA182",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 86004,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 50.1,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 216.1,
    periodDays: 0.761833,
    apsisPrecessionYears: 2.226,
    nodePrecessionYears: 4.454,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "45"
  },
  {
    id: 379,
    planet: "Uranus",
    name: "Cordelia",
    iauCode: "706",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 49755,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 287.4,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 1.1,
    periodDays: 0.3347,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0.6,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 380,
    planet: "Uranus",
    name: "Ophelia",
    iauCode: "707",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 53765,
    e: 0.011,
    argPeriapsisDeg: 19.3,
    meanAnomalyDeg: 213.4,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 151.6,
    periodDays: 0.3764,
    apsisPrecessionYears: 0.4,
    nodePrecessionYears: 0.8,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 381,
    planet: "Uranus",
    name: "Bianca",
    iauCode: "708",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 59170,
    e: 6e-3,
    argPeriapsisDeg: 328,
    meanAnomalyDeg: 109.1,
    inclinationDeg: 2.3,
    ascendingNodeDeg: 272.5,
    periodDays: 0.4347,
    apsisPrecessionYears: 0.5,
    nodePrecessionYears: 1.1,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 382,
    planet: "Uranus",
    name: "Cressida",
    iauCode: "709",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 61770,
    e: 4e-3,
    argPeriapsisDeg: 87.9,
    meanAnomalyDeg: 0.5,
    inclinationDeg: 1.8,
    ascendingNodeDeg: 308.2,
    periodDays: 0.4639,
    apsisPrecessionYears: 0.6,
    nodePrecessionYears: 1.2,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 383,
    planet: "Uranus",
    name: "Desdemona",
    iauCode: "710",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 62663,
    e: 7e-3,
    argPeriapsisDeg: 137,
    meanAnomalyDeg: 230,
    inclinationDeg: 3.1,
    ascendingNodeDeg: 283.9,
    periodDays: 0.4736,
    apsisPrecessionYears: 0.6,
    nodePrecessionYears: 1.3,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 384,
    planet: "Uranus",
    name: "Juliet",
    iauCode: "711",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 64362,
    e: 6e-3,
    argPeriapsisDeg: 274.9,
    meanAnomalyDeg: 319.8,
    inclinationDeg: 3,
    ascendingNodeDeg: 141,
    periodDays: 0.4931,
    apsisPrecessionYears: 0.7,
    nodePrecessionYears: 1.4,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 385,
    planet: "Uranus",
    name: "Portia",
    iauCode: "712",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 66101,
    e: 4e-3,
    argPeriapsisDeg: 31.6,
    meanAnomalyDeg: 310.1,
    inclinationDeg: 2.7,
    ascendingNodeDeg: 146.7,
    periodDays: 0.5132,
    apsisPrecessionYears: 0.8,
    nodePrecessionYears: 1.6,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 386,
    planet: "Uranus",
    name: "Rosalind",
    iauCode: "713",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 69930,
    e: 3e-3,
    argPeriapsisDeg: 231.8,
    meanAnomalyDeg: 287.7,
    inclinationDeg: 1.7,
    ascendingNodeDeg: 330,
    periodDays: 0.5583,
    apsisPrecessionYears: 0.9,
    nodePrecessionYears: 1.9,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 387,
    planet: "Uranus",
    name: "Belinda",
    iauCode: "714",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 75258,
    e: 2e-3,
    argPeriapsisDeg: 58.6,
    meanAnomalyDeg: 226.4,
    inclinationDeg: 1.4,
    ascendingNodeDeg: 96.2,
    periodDays: 0.6236,
    apsisPrecessionYears: 1.2,
    nodePrecessionYears: 2.4,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 388,
    planet: "Uranus",
    name: "Puck",
    iauCode: "715",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 86007,
    e: 9e-3,
    argPeriapsisDeg: 337,
    meanAnomalyDeg: 264.1,
    inclinationDeg: 1.1,
    ascendingNodeDeg: 111.2,
    periodDays: 0.7618,
    apsisPrecessionYears: 1.9,
    nodePrecessionYears: 3.9,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 389,
    planet: "Uranus",
    name: "Perdita",
    iauCode: "725",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 76418,
    e: 5e-3,
    argPeriapsisDeg: 296.9,
    meanAnomalyDeg: 168,
    inclinationDeg: 1.6,
    ascendingNodeDeg: 270.4,
    periodDays: 0.6382,
    apsisPrecessionYears: 1.3,
    nodePrecessionYears: 2.6,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 390,
    planet: "Uranus",
    name: "Mab",
    iauCode: "726",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 97737,
    e: 6e-3,
    argPeriapsisDeg: 318.6,
    meanAnomalyDeg: 250.8,
    inclinationDeg: 1.8,
    ascendingNodeDeg: 307.8,
    periodDays: 0.9229,
    apsisPrecessionYears: 3.1,
    nodePrecessionYears: 6.1,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 391,
    planet: "Uranus",
    name: "Cupid",
    iauCode: "727",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 74396,
    e: 7e-3,
    argPeriapsisDeg: 168,
    meanAnomalyDeg: 3.3,
    inclinationDeg: 2,
    ascendingNodeDeg: 31.1,
    periodDays: 0.6125,
    apsisPrecessionYears: 1.2,
    nodePrecessionYears: 2.3,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 392,
    planet: "Uranus",
    name: "S2025_U_1",
    iauCode: "75052",
    ephemeris: "URA184",
    frame: "Laplace",
    epochTdb: "2025-01-01.0",
    aKm: 57844,
    e: 0.039,
    argPeriapsisDeg: 313.9,
    meanAnomalyDeg: 275.6,
    inclinationDeg: 4,
    ascendingNodeDeg: 70.8,
    periodDays: 0.4201,
    apsisPrecessionYears: 0.5,
    nodePrecessionYears: 1,
    poleRaDeg: 77.3,
    poleDecDeg: 15.2,
    poleTiltDeg: 180,
    reference: "10"
  },
  {
    id: 393,
    planet: "Uranus",
    name: "Caliban",
    iauCode: "716",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 7167e3,
    e: 0.2,
    argPeriapsisDeg: 349.7,
    meanAnomalyDeg: 241.2,
    inclinationDeg: 141.4,
    ascendingNodeDeg: 174.9,
    periodDays: 580,
    apsisPrecessionYears: 8795,
    nodePrecessionYears: 6483,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 394,
    planet: "Uranus",
    name: "Sycorax",
    iauCode: "717",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 12193200,
    e: 0.52,
    argPeriapsisDeg: 25.4,
    meanAnomalyDeg: 332.1,
    inclinationDeg: 157,
    ascendingNodeDeg: 267.1,
    periodDays: 1286,
    apsisPrecessionYears: 1394,
    nodePrecessionYears: 1863,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 395,
    planet: "Uranus",
    name: "Prospero",
    iauCode: "718",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 16221e3,
    e: 0.441,
    argPeriapsisDeg: 180.4,
    meanAnomalyDeg: 197.6,
    inclinationDeg: 149.4,
    ascendingNodeDeg: 324.5,
    periodDays: 1974,
    apsisPrecessionYears: 1154,
    nodePrecessionYears: 1369,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 396,
    planet: "Uranus",
    name: "Setebos",
    iauCode: "719",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 17519800,
    e: 0.579,
    argPeriapsisDeg: 356.1,
    meanAnomalyDeg: 148,
    inclinationDeg: 153.9,
    ascendingNodeDeg: 244.7,
    periodDays: 2215,
    apsisPrecessionYears: 48,
    nodePrecessionYears: 48,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 397,
    planet: "Uranus",
    name: "Stephano",
    iauCode: "720",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 7951400,
    e: 0.235,
    argPeriapsisDeg: 17.1,
    meanAnomalyDeg: 164.4,
    inclinationDeg: 143.6,
    ascendingNodeDeg: 193.3,
    periodDays: 677,
    apsisPrecessionYears: 5469,
    nodePrecessionYears: 5190,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 398,
    planet: "Uranus",
    name: "Trinculo",
    iauCode: "721",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 8502600,
    e: 0.22,
    argPeriapsisDeg: 162.2,
    meanAnomalyDeg: 55.6,
    inclinationDeg: 167.1,
    ascendingNodeDeg: 196.5,
    periodDays: 749,
    apsisPrecessionYears: 2589,
    nodePrecessionYears: 4265,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 399,
    planet: "Uranus",
    name: "Francisco",
    iauCode: "722",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 4275700,
    e: 0.144,
    argPeriapsisDeg: 137.6,
    meanAnomalyDeg: 288.4,
    inclinationDeg: 146.8,
    ascendingNodeDeg: 101.9,
    periodDays: 267,
    apsisPrecessionYears: 12473,
    nodePrecessionYears: 14419,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 400,
    planet: "Uranus",
    name: "Margaret",
    iauCode: "723",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 14425e3,
    e: 0.642,
    argPeriapsisDeg: 90.7,
    meanAnomalyDeg: 115.9,
    inclinationDeg: 60.5,
    ascendingNodeDeg: 0.9,
    periodDays: 1655,
    apsisPrecessionYears: null,
    nodePrecessionYears: 1002,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 401,
    planet: "Uranus",
    name: "Ferdinand",
    iauCode: "724",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 20421400,
    e: 0.395,
    argPeriapsisDeg: 166.9,
    meanAnomalyDeg: 172.3,
    inclinationDeg: 169.2,
    ascendingNodeDeg: 223.9,
    periodDays: 2788,
    apsisPrecessionYears: 747,
    nodePrecessionYears: 1001,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 402,
    planet: "Uranus",
    name: "S2023_U1",
    iauCode: "75051",
    ephemeris: "URA117",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 7976600,
    e: 0.25,
    argPeriapsisDeg: 158.7,
    meanAnomalyDeg: 101.8,
    inclinationDeg: 143.9,
    ascendingNodeDeg: 260.2,
    periodDays: 681,
    apsisPrecessionYears: 5078,
    nodePrecessionYears: 5022,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 403,
    planet: "Neptune",
    name: "Triton",
    iauCode: "801",
    ephemeris: "NEP097",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 354800,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 63,
    inclinationDeg: 157.3,
    ascendingNodeDeg: 178.1,
    periodDays: 5.876994,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 340.379,
    poleRaDeg: 299.8,
    poleDecDeg: 43.1,
    poleTiltDeg: 0.4,
    reference: "24"
  },
  {
    id: 404,
    planet: "Neptune",
    name: "Naiad",
    iauCode: "803",
    ephemeris: "NEP097",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 48200,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 89.7,
    inclinationDeg: 4.7,
    ascendingNodeDeg: 41.4,
    periodDays: 0.29398,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0.575,
    poleRaDeg: 299.7,
    poleDecDeg: 42.7,
    poleTiltDeg: 0.4,
    reference: "24"
  },
  {
    id: 405,
    planet: "Neptune",
    name: "Thalassa",
    iauCode: "804",
    ephemeris: "NEP097",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 50100,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 165.7,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 130.6,
    periodDays: 0.311078,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0.654,
    poleRaDeg: 299.7,
    poleDecDeg: 42.7,
    poleTiltDeg: 0.4,
    reference: "24"
  },
  {
    id: 406,
    planet: "Neptune",
    name: "Despina",
    iauCode: "805",
    ephemeris: "NEP097",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 52500,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 125.1,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.334656,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0,
    poleRaDeg: 299.7,
    poleDecDeg: 42.7,
    poleTiltDeg: 0.4,
    reference: "24"
  },
  {
    id: 407,
    planet: "Neptune",
    name: "Galatea",
    iauCode: "806",
    ephemeris: "NEP097",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 62e3,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 86.7,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 0.428744,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0,
    poleRaDeg: 299.8,
    poleDecDeg: 43.1,
    poleTiltDeg: 0.4,
    reference: "24"
  },
  {
    id: 408,
    planet: "Neptune",
    name: "Larissa",
    iauCode: "807",
    ephemeris: "NEP097",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 73500,
    e: 1e-3,
    argPeriapsisDeg: 247.3,
    meanAnomalyDeg: 165.5,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 312,
    periodDays: 0.554989,
    apsisPrecessionYears: 1.257,
    nodePrecessionYears: 2.514,
    poleRaDeg: 299.8,
    poleDecDeg: 43.1,
    poleTiltDeg: 0.4,
    reference: "24"
  },
  {
    id: 409,
    planet: "Neptune",
    name: "Proteus",
    iauCode: "808",
    ephemeris: "NEP097",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 117600,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 276.8,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 1.122315,
    apsisPrecessionYears: 0,
    nodePrecessionYears: 0,
    poleRaDeg: 299.8,
    poleDecDeg: 42.6,
    poleTiltDeg: 0.9,
    reference: "24"
  },
  {
    id: 410,
    planet: "Neptune",
    name: "Hippocamp",
    iauCode: "814",
    ephemeris: "NEP097",
    frame: "Laplace",
    epochTdb: "2000-01-01.5",
    aKm: 105300,
    e: 1e-3,
    argPeriapsisDeg: 346.4,
    meanAnomalyDeg: 286.5,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 0.5,
    periodDays: 0.95039,
    apsisPrecessionYears: 8.726,
    nodePrecessionYears: 661.762,
    poleRaDeg: 299.8,
    poleDecDeg: 43,
    poleTiltDeg: 0.4,
    reference: "24"
  },
  {
    id: 411,
    planet: "Neptune",
    name: "Nereid",
    iauCode: "802",
    ephemeris: "NEP105",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 5513900,
    e: 0.751,
    argPeriapsisDeg: 296.8,
    meanAnomalyDeg: 318.5,
    inclinationDeg: 5.1,
    ascendingNodeDeg: 319.5,
    periodDays: 360.133039,
    apsisPrecessionYears: 7990.433,
    nodePrecessionYears: 9426.334,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "44"
  },
  {
    id: 412,
    planet: "Neptune",
    name: "Halimede",
    iauCode: "809",
    ephemeris: "NEP104",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 16590500,
    e: 0.521,
    argPeriapsisDeg: 157.9,
    meanAnomalyDeg: 135.8,
    inclinationDeg: 119.6,
    ascendingNodeDeg: 198.5,
    periodDays: 1879,
    apsisPrecessionYears: 5395,
    nodePrecessionYears: 5156,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 413,
    planet: "Neptune",
    name: "Psamathe",
    iauCode: "810",
    ephemeris: "NEP104",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 47646600,
    e: 0.413,
    argPeriapsisDeg: 148.2,
    meanAnomalyDeg: 183.2,
    inclinationDeg: 127.8,
    ascendingNodeDeg: 302.9,
    periodDays: 9149,
    apsisPrecessionYears: 1484,
    nodePrecessionYears: 1333,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 414,
    planet: "Neptune",
    name: "Sao",
    iauCode: "811",
    ephemeris: "NEP104",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 22239900,
    e: 0.296,
    argPeriapsisDeg: 93.5,
    meanAnomalyDeg: 178.5,
    inclinationDeg: 50.2,
    ascendingNodeDeg: 41.8,
    periodDays: 2919,
    apsisPrecessionYears: null,
    nodePrecessionYears: 4454,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 415,
    planet: "Neptune",
    name: "Laomedeia",
    iauCode: "812",
    ephemeris: "NEP104",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 23499900,
    e: 0.419,
    argPeriapsisDeg: 146.2,
    meanAnomalyDeg: 248.1,
    inclinationDeg: 36.9,
    ascendingNodeDeg: 57.6,
    periodDays: 3168,
    apsisPrecessionYears: 2255,
    nodePrecessionYears: 3154,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 416,
    planet: "Neptune",
    name: "Neso",
    iauCode: "813",
    ephemeris: "NEP104",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 49897800,
    e: 0.455,
    argPeriapsisDeg: 89.8,
    meanAnomalyDeg: 13.8,
    inclinationDeg: 128.4,
    ascendingNodeDeg: 55.4,
    periodDays: 9805,
    apsisPrecessionYears: null,
    nodePrecessionYears: 1116,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 417,
    planet: "Neptune",
    name: "S2002_N5",
    iauCode: "85051",
    ephemeris: "NEP104",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 23414700,
    e: 0.433,
    argPeriapsisDeg: 59.1,
    meanAnomalyDeg: 303.2,
    inclinationDeg: 46.3,
    ascendingNodeDeg: 258.3,
    periodDays: 3151,
    apsisPrecessionYears: 2869,
    nodePrecessionYears: 3121,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 418,
    planet: "Neptune",
    name: "S2021_N1",
    iauCode: "85052",
    ephemeris: "NEP104",
    frame: "ecliptic",
    epochTdb: "2020-01-01.0",
    aKm: 50700200,
    e: 0.503,
    argPeriapsisDeg: 90.4,
    meanAnomalyDeg: 237.1,
    inclinationDeg: 135.2,
    ascendingNodeDeg: 258.9,
    periodDays: 10043,
    apsisPrecessionYears: null,
    nodePrecessionYears: 924,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "43"
  },
  {
    id: 419,
    planet: "Pluto",
    name: "Charon",
    iauCode: "901",
    ephemeris: "PLU060",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 19600,
    e: 0,
    argPeriapsisDeg: 0,
    meanAnomalyDeg: 304.1,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 6.387222,
    apsisPrecessionYears: null,
    nodePrecessionYears: null,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "6"
  },
  {
    id: 420,
    planet: "Pluto",
    name: "Styx",
    iauCode: "905",
    ephemeris: "PLU060",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 43200,
    e: 0.025,
    argPeriapsisDeg: 322.5,
    meanAnomalyDeg: 358.1,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 20.16,
    apsisPrecessionYears: null,
    nodePrecessionYears: null,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "6"
  },
  {
    id: 421,
    planet: "Pluto",
    name: "Nix",
    iauCode: "902",
    ephemeris: "PLU060",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 49300,
    e: 0.015,
    argPeriapsisDeg: 31.4,
    meanAnomalyDeg: 338.2,
    inclinationDeg: 0,
    ascendingNodeDeg: 0,
    periodDays: 24.85,
    apsisPrecessionYears: null,
    nodePrecessionYears: null,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "6"
  },
  {
    id: 422,
    planet: "Pluto",
    name: "Kerberos",
    iauCode: "904",
    ephemeris: "PLU060",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 58300,
    e: 0.01,
    argPeriapsisDeg: 32.1,
    meanAnomalyDeg: 276.1,
    inclinationDeg: 0.4,
    ascendingNodeDeg: 314.3,
    periodDays: 32.17,
    apsisPrecessionYears: null,
    nodePrecessionYears: 9,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "6"
  },
  {
    id: 423,
    planet: "Pluto",
    name: "Hydra",
    iauCode: "903",
    ephemeris: "PLU060",
    frame: "equatorial",
    epochTdb: "2000-01-01.5",
    aKm: 65200,
    e: 9e-3,
    argPeriapsisDeg: 139.3,
    meanAnomalyDeg: 335,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 114.3,
    periodDays: 38.2,
    apsisPrecessionYears: null,
    nodePrecessionYears: 14,
    poleRaDeg: null,
    poleDecDeg: null,
    poleTiltDeg: null,
    reference: "6"
  }
];

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/sim/catalog.ts
var moons = moons_default;
var EPHEMERIS_REQUIRED_MOONS = /* @__PURE__ */ new Set(["Titan", "Iapetus", "Phoebe", "Cordelia"]);
var PARENT_TINTS = {
  Earth: "#d2d8e3",
  Mars: "#c9b8a7",
  Jupiter: "#cab8a0",
  Saturn: "#cdbf9f",
  Uranus: "#a7c5cb",
  Neptune: "#9eb3d5",
  Pluto: "#b8aca4"
};
var DEG_TO_RAD4 = Math.PI / 180;
var RAD_TO_DEG = 180 / Math.PI;
var EARTH_OBLIQUITY_DEG = 23.439281;
var PARENT_AXIAL_TILT_DEG = Object.fromEntries(
  PLANETS.map((planet) => [planet.id, Math.abs(planet.axialTiltDeg ?? 0)])
);
var SOURCE_FRAME_REFERENCE_ECLIPTIC_AXIS = {
  x: 0,
  y: Math.sin(EARTH_OBLIQUITY_DEG * DEG_TO_RAD4),
  z: Math.cos(EARTH_OBLIQUITY_DEG * DEG_TO_RAD4)
};
var PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC = {
  uranus: negateVector(normalizeVector(equatorialToEcliptic(raDecToEquatorialUnit(257.311, -15.175)))),
  pluto: normalizeVector(equatorialToEcliptic(raDecToEquatorialUnit(132.993, -6.163)))
};
function normalizeDegrees(value) {
  const mod = value % 360;
  return mod < 0 ? mod + 360 : mod;
}
function orbitNormalFromElements(iDeg, ascendingNodeDeg) {
  const i = (iDeg ?? 0) * DEG_TO_RAD4;
  const omega = (ascendingNodeDeg ?? 0) * DEG_TO_RAD4;
  const sinI = Math.sin(i);
  return {
    x: Math.sin(omega) * sinI,
    y: -Math.cos(omega) * sinI,
    z: Math.cos(i)
  };
}
function vectorMagnitude(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}
function normalizeVector(vector) {
  const mag = vectorMagnitude(vector);
  if (mag < 1e-12) {
    return { x: 0, y: 0, z: 1 };
  }
  return {
    x: vector.x / mag,
    y: vector.y / mag,
    z: vector.z / mag
  };
}
function negateVector(vector) {
  return { x: -vector.x, y: -vector.y, z: -vector.z };
}
function crossProduct(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function dotProduct(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function rotateVectorAroundX(vector, angleDeg) {
  const angle = angleDeg * DEG_TO_RAD4;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return {
    x: vector.x,
    y: vector.y * cosA - vector.z * sinA,
    z: vector.y * sinA + vector.z * cosA
  };
}
function elementsFromOrbitNormal(normal) {
  const z = clamp3(normal.z, -1, 1);
  const iRad = Math.acos(z);
  const ascendingNodeRad = Math.atan2(normal.x, -normal.y);
  return {
    iDeg: iRad * RAD_TO_DEG,
    ascendingNodeDeg: normalizeDegrees(ascendingNodeRad * RAD_TO_DEG)
  };
}
function transformSourceVectorToEcliptic(vector, basis) {
  return {
    x: basis.x.x * vector.x + basis.y.x * vector.y + basis.z.x * vector.z,
    y: basis.x.y * vector.x + basis.y.y * vector.y + basis.z.y * vector.z,
    z: basis.x.z * vector.x + basis.y.z * vector.y + basis.z.z * vector.z
  };
}
function periapsisVectorFromElements(inclinationDeg, ascendingNodeDeg, argPeriapsisDeg) {
  const i = (inclinationDeg ?? 0) * DEG_TO_RAD4;
  const omega = (ascendingNodeDeg ?? 0) * DEG_TO_RAD4;
  const argPeriapsis = (argPeriapsisDeg ?? 0) * DEG_TO_RAD4;
  const cosNode = Math.cos(omega);
  const sinNode = Math.sin(omega);
  const cosArg = Math.cos(argPeriapsis);
  const sinArg = Math.sin(argPeriapsis);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);
  return {
    x: cosNode * cosArg - sinNode * sinArg * cosI,
    y: sinNode * cosArg + cosNode * sinArg * cosI,
    z: sinArg * sinI
  };
}
function basisFromSourcePole(sourcePole) {
  let planeXAxis = crossProduct(SOURCE_FRAME_REFERENCE_ECLIPTIC_AXIS, sourcePole);
  if (vectorMagnitude(planeXAxis) < 1e-9) {
    planeXAxis = { x: 1, y: 0, z: 0 };
  } else {
    planeXAxis = normalizeVector(planeXAxis);
  }
  return {
    x: planeXAxis,
    y: normalizeVector(crossProduct(sourcePole, planeXAxis)),
    z: sourcePole
  };
}
function normalizeAngleWithinPlaneDegrees(normal, periapsisVector) {
  const nodeVector = crossProduct({ x: 0, y: 0, z: 1 }, normal);
  const nodeMagnitude = vectorMagnitude(nodeVector);
  const projectionScale = dotProduct(periapsisVector, normal);
  const periapsisProjected = normalizeVector({
    x: periapsisVector.x - normal.x * projectionScale,
    y: periapsisVector.y - normal.y * projectionScale,
    z: periapsisVector.z - normal.z * projectionScale
  });
  if (nodeMagnitude < 1e-9) {
    return normalizeDegrees(Math.atan2(periapsisProjected.y, periapsisProjected.x) * RAD_TO_DEG);
  }
  const nodeUnit = normalizeVector(nodeVector);
  const transverseUnit = normalizeVector(crossProduct(normal, nodeUnit));
  return normalizeDegrees(
    Math.atan2(
      dotProduct(periapsisProjected, transverseUnit),
      dotProduct(periapsisProjected, nodeUnit)
    ) * RAD_TO_DEG
  );
}
function raDecToEquatorialUnit(raDeg, decDeg) {
  const ra = (raDeg ?? 0) * DEG_TO_RAD4;
  const dec = (decDeg ?? 0) * DEG_TO_RAD4;
  const cosDec = Math.cos(dec);
  return {
    x: cosDec * Math.cos(ra),
    y: cosDec * Math.sin(ra),
    z: Math.sin(dec)
  };
}
function equatorialToEcliptic(vectorEq) {
  const obliquity = EARTH_OBLIQUITY_DEG * DEG_TO_RAD4;
  const cosOb = Math.cos(obliquity);
  const sinOb = Math.sin(obliquity);
  return {
    x: vectorEq.x,
    y: cosOb * vectorEq.y + sinOb * vectorEq.z,
    z: -sinOb * vectorEq.y + cosOb * vectorEq.z
  };
}
function sourcePoleInEcliptic(moon, parentId, sourceFrame) {
  if (Number.isFinite(moon.poleRaDeg) && Number.isFinite(moon.poleDecDeg)) {
    const poleEq = raDecToEquatorialUnit(moon.poleRaDeg, moon.poleDecDeg);
    return normalizeVector(equatorialToEcliptic(poleEq));
  }
  const parentPoleOverride = PARENT_EQUATOR_POLE_OVERRIDE_ECLIPTIC[parentId];
  if (parentPoleOverride && sourceFrame !== "laplace") {
    return parentPoleOverride;
  }
  const parentTilt = PARENT_AXIAL_TILT_DEG[parentId] ?? 0;
  const laplaceTilt = Number.isFinite(moon.poleTiltDeg) ? moon.poleTiltDeg : 0;
  const frameTiltDeg = sourceFrame === "laplace" ? parentTilt + laplaceTilt : parentTilt;
  return normalizeVector(rotateVectorAroundX({ x: 0, y: 0, z: 1 }, frameTiltDeg));
}
function convertMoonOrbitFrameToEcliptic(moon, parentId) {
  const sourceFrame = `${moon.frame ?? ""}`.trim().toLowerCase();
  if (sourceFrame === "ecliptic" || sourceFrame.length === 0) {
    return {
      iDeg: moon.inclinationDeg,
      ascendingNodeDeg: normalizeDegrees(moon.ascendingNodeDeg ?? 0),
      argPeriapsisDeg: normalizeDegrees(moon.argPeriapsisDeg ?? 0),
      sourceFrame: sourceFrame || "ecliptic"
    };
  }
  const sourcePole = sourcePoleInEcliptic(moon, parentId, sourceFrame);
  const basis = basisFromSourcePole(sourcePole);
  const sourceNormal = orbitNormalFromElements(moon.inclinationDeg, moon.ascendingNodeDeg);
  const sourcePeriapsis = periapsisVectorFromElements(moon.inclinationDeg, moon.ascendingNodeDeg, moon.argPeriapsisDeg);
  const eclipticNormal = normalizeVector(transformSourceVectorToEcliptic(sourceNormal, basis));
  const eclipticPeriapsis = normalizeVector(transformSourceVectorToEcliptic(sourcePeriapsis, basis));
  const resolvedElements = elementsFromOrbitNormal(eclipticNormal);
  return {
    iDeg: resolvedElements.iDeg,
    ascendingNodeDeg: resolvedElements.ascendingNodeDeg,
    argPeriapsisDeg: normalizeAngleWithinPlaneDegrees(eclipticNormal, eclipticPeriapsis),
    sourceFrame
  };
}
var JULIAN_CENTURY_DAYS3 = 36525;
var MAX_PRECESSION_RATE_FRACTION_OF_MEAN_MOTION = 0.25;
var SIDEREAL_PERIOD_EPHEMERIDES = /* @__PURE__ */ new Set([
  "DE405/LE405",
  "SAT441",
  "URA182",
  "URA184",
  "PLU060"
]);
function precessionRateDegreesPerCentury(periodYears, directionSign, orbitalPeriodDays) {
  if (!Number.isFinite(periodYears)) {
    return void 0;
  }
  const years = Number(periodYears);
  if (years === 0) {
    return 0;
  }
  const rateDegPerCentury = directionSign * (36e3 / years);
  if (Number.isFinite(orbitalPeriodDays) && orbitalPeriodDays > 0) {
    const meanMotionDegPerDay = 360 / orbitalPeriodDays;
    const rateDegPerDay = Math.abs(rateDegPerCentury) / JULIAN_CENTURY_DAYS3;
    if (rateDegPerDay > MAX_PRECESSION_RATE_FRACTION_OF_MEAN_MOTION * meanMotionDegPerDay) {
      return void 0;
    }
  }
  return rateDegPerCentury;
}
function resolveMoonSecularRates(moon) {
  const argRate = precessionRateDegreesPerCentury(moon.apsisPrecessionYears, 1, moon.periodDays);
  const nodeRate = precessionRateDegreesPerCentury(moon.nodePrecessionYears, -1, moon.periodDays);
  if (argRate === void 0 && nodeRate === void 0) {
    return void 0;
  }
  const rates = {
    argPeriapsisDegPerCentury: argRate,
    ascendingNodeDegPerCentury: nodeRate
  };
  if (moon.ephemeris !== void 0 && SIDEREAL_PERIOD_EPHEMERIDES.has(moon.ephemeris)) {
    rates.periodIsMeanLongitudePeriod = true;
  }
  return rates;
}
function resolveMoonRotationPeriodHours(moon) {
  const explicit = MOON_ROTATION_PERIOD_HOURS[moon.name];
  if (Number.isFinite(explicit)) {
    return explicit ?? null;
  }
  if (!MAJOR_MOONS.has(moon.name) || !Number.isFinite(moon.periodDays) || moon.periodDays <= 0) {
    return null;
  }
  const rotationHours = moon.periodDays * 24;
  return moon.name === "Triton" ? -rotationHours : rotationHours;
}
function normalizeMoonOrbitFrame(moon, parentId) {
  return convertMoonOrbitFrameToEcliptic(moon, parentId);
}
function stableHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
function estimateMoonRadiusKm(moon) {
  const knownRadius = MAJOR_MOON_RADII_KM[moon.name];
  if (knownRadius) {
    return knownRadius;
  }
  const hash = stableHash(`${moon.planet}:${moon.name}`);
  const parentScale = {
    Earth: [5, 15],
    Mars: [3, 20],
    Jupiter: [2, 45],
    Saturn: [2, 35],
    Uranus: [2, 30],
    Neptune: [2, 28],
    Pluto: [2, 20]
  };
  const [min, max] = parentScale[moon.planet] ?? [2, 25];
  const normalized = hash % 1e4 / 1e4;
  const base = min + (max - min) * normalized;
  const distanceFactor = Math.max(0.25, 1 / Math.sqrt(Math.max(1, moon.aKm / 4e5)));
  return Math.max(1.5, base * distanceFactor);
}
function displayRadiusAu(radiusKm, type) {
  if (type === "star") {
    return Math.sqrt(radiusKm) * 45e-5;
  }
  if (type === "planet" || type === "dwarf") {
    return Math.max(8e-3, Math.sqrt(radiusKm) * 42e-5);
  }
  if (type === "asteroid") {
    return Math.max(5e-3, Math.sqrt(radiusKm) * 35e-5);
  }
  return Math.max(55e-5, Math.sqrt(radiusKm) * 18e-5);
}
function moonColor(planet) {
  return PARENT_TINTS[planet] ?? "#c5c5c5";
}
function makeMoonId(moon, usedIds) {
  const baseId = `moon-${sanitizeIdPart(moon.planet)}-${sanitizeIdPart(moon.name)}`;
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }
  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  const id = `${baseId}-${suffix}`;
  usedIds.add(id);
  return id;
}
function applyDisplayScaleConstraints(bodies) {
  const minMoonOrbitByParent = /* @__PURE__ */ new Map();
  for (const body of bodies) {
    if (body.type !== "moon" || !body.orbit || !Number.isFinite(body.orbit.aAu)) {
      continue;
    }
    const moonMaxRadius = body.orbit.aAu * 0.18;
    const moonMinRadius = body.realRadiusAu * 2.5;
    body.displayRadiusAu = Math.max(moonMinRadius, Math.min(body.displayRadiusAu, moonMaxRadius));
    const parentId = body.parentId;
    const currentMin = minMoonOrbitByParent.get(parentId);
    if (currentMin === void 0 || body.orbit.aAu < currentMin) {
      minMoonOrbitByParent.set(parentId, body.orbit.aAu);
    }
  }
  for (const body of bodies) {
    const closestMoonOrbit = minMoonOrbitByParent.get(body.id);
    if (closestMoonOrbit === void 0) {
      continue;
    }
    const parentMaxRadius = closestMoonOrbit * 0.65;
    const parentMinRadius = body.realRadiusAu * 1.1;
    body.displayRadiusAu = Math.max(parentMinRadius, Math.min(body.displayRadiusAu, parentMaxRadius));
  }
}
function createSolarSystemCatalog({ moonEphemerides = {} } = {}) {
  const usedIds = /* @__PURE__ */ new Set();
  const bodies = [];
  const sunBody = {
    ...SUN,
    parentId: null,
    isMajor: true,
    equatorialRadiusKm: SUN.radiusKm,
    polarRadiusKm: SUN.radiusKm,
    displayRadiusAu: displayRadiusAu(SUN.radiusKm, SUN.type),
    realRadiusAu: SUN.radiusKm / AU_KM2,
    orbit: null
  };
  usedIds.add(sunBody.id);
  bodies.push(sunBody);
  for (const planet of PLANETS) {
    const equatorialRadiusKm = Number.isFinite(planet.equatorialRadiusKm) ? planet.equatorialRadiusKm : planet.radiusKm;
    const polarRadiusKm = Number.isFinite(planet.polarRadiusKm) ? planet.polarRadiusKm : planet.radiusKm;
    usedIds.add(planet.id);
    bodies.push({
      ...planet,
      parentId: "sun",
      isMajor: true,
      equatorialRadiusKm,
      polarRadiusKm,
      displayRadiusAu: displayRadiusAu(planet.radiusKm, planet.type),
      realRadiusAu: planet.radiusKm / AU_KM2,
      orbit: {
        ...planet.orbit,
        epochJd: planet.orbit.epochJd
      }
    });
  }
  const planetNameToId = /* @__PURE__ */ new Map([
    ["Earth", "earth"],
    ["Mars", "mars"],
    ["Jupiter", "jupiter"],
    ["Saturn", "saturn"],
    ["Uranus", "uranus"],
    ["Neptune", "neptune"],
    ["Pluto", "pluto"]
  ]);
  for (const moon of moons) {
    const parentId = planetNameToId.get(moon.planet);
    if (!parentId) {
      continue;
    }
    const radiusKm = estimateMoonRadiusKm(moon);
    const moonShape = MAJOR_MOON_SHAPE_KM[moon.name];
    const equatorialRadiusKm = Number.isFinite(moonShape?.equatorialRadiusKm) ? moonShape.equatorialRadiusKm : radiusKm;
    const polarRadiusKm = Number.isFinite(moonShape?.polarRadiusKm) ? moonShape.polarRadiusKm : radiusKm;
    const id = makeMoonId(moon, usedIds);
    const frameNormalized = normalizeMoonOrbitFrame(moon, parentId);
    const sourceFrame = `${moon.frame ?? ""}`.trim().toLowerCase();
    const usesNativeSourceFrame = sourceFrame !== "" && sourceFrame !== "ecliptic";
    const sourceFrameBasis = usesNativeSourceFrame ? basisFromSourcePole(sourcePoleInEcliptic(moon, parentId, sourceFrame)) : void 0;
    const ephemeris = moonEphemerides[moon.name.toLowerCase()];
    const ephemerisRequired = EPHEMERIS_REQUIRED_MOONS.has(moon.name);
    bodies.push({
      id,
      name: moon.name,
      type: "moon",
      parentId,
      massKg: null,
      radiusKm,
      equatorialRadiusKm,
      polarRadiusKm,
      displayRadiusAu: displayRadiusAu(radiusKm, "moon"),
      realRadiusAu: radiusKm / AU_KM2,
      color: moonColor(moon.planet),
      isMajor: MAJOR_MOONS.has(moon.name),
      rotationPeriodHours: resolveMoonRotationPeriodHours(moon),
      reference: moon.reference,
      orbitFrameSource: frameNormalized.sourceFrame,
      orbitEphemerisSource: ephemeris?.provenance.sourceEphemeris,
      orbit: {
        epochJd: parseEpochDateToJulian(moon.epochTdb),
        aAu: moon.aKm / AU_KM2,
        e: moon.e,
        // Preserve native angles whenever the source is Laplace/equatorial. Their
        // secular rates are defined in that frame; converting once and subsequently
        // precessing ecliptic angles rotates around the wrong pole.
        iDeg: usesNativeSourceFrame ? moon.inclinationDeg : frameNormalized.iDeg,
        ascendingNodeDeg: usesNativeSourceFrame ? moon.ascendingNodeDeg : frameNormalized.ascendingNodeDeg,
        argPeriapsisDeg: usesNativeSourceFrame ? moon.argPeriapsisDeg : frameNormalized.argPeriapsisDeg,
        meanAnomalyDeg: moon.meanAnomalyDeg,
        periodDays: moon.periodDays,
        secularRates: resolveMoonSecularRates(moon),
        sourceFrameBasis,
        ephemeris,
        ephemerisRequired
      }
    });
  }
  applyDisplayScaleConstraints(bodies);
  const jumpBodyIds = [
    ...MAJOR_BODY_IDS,
    ...bodies.filter((body) => body.type === "moon" && body.isMajor).map((body) => body.id).sort((a, b) => a.localeCompare(b))
  ];
  const plannerBodyIds = bodies.filter((body) => body.parentId === "sun" && body.id !== "sun" && body.type !== "star").sort((a, b) => {
    const aOrbit = a.orbit?.aAu ?? Number.POSITIVE_INFINITY;
    const bOrbit = b.orbit?.aAu ?? Number.POSITIVE_INFINITY;
    return aOrbit - bOrbit;
  }).map((body) => body.id);
  return {
    bodies,
    jumpBodyIds,
    plannerBodyIds
  };
}

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/sim/asteroidBelt.ts
function colorForTaxonomy(tax, rand) {
  const v = (lo, hi) => Math.floor(lo + (hi - lo) * rand());
  switch (tax) {
    case 0 /* C */: {
      const g = v(50, 90);
      return g << 16 | g - 4 << 8 | g - 8;
    }
    case 1 /* S */: {
      return v(150, 190) << 16 | v(120, 155) << 8 | v(90, 120);
    }
    case 2 /* M */: {
      const g = v(140, 195);
      return g << 16 | g << 8 | g + 5;
    }
    default:
      return 8026738;
  }
}
function albedoForTaxonomy(tax, rand) {
  switch (tax) {
    case 0 /* C */:
      return 0.03 + rand() * 0.07;
    case 1 /* S */:
      return 0.1 + rand() * 0.15;
    case 2 /* M */:
      return 0.1 + rand() * 0.1;
    default:
      return 0.1 + rand() * 0.08;
  }
}
var DEG = Math.PI / 180;
var TWO_PI4 = Math.PI * 2;

// ../../../../../../tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/sim/phase1AsteroidCatalog.ts
var PHASE1_DEFAULT_URL = "/data/asteroid-phase1/asteroid_phase1_main_100000.bin";
var PHASE1_DEFAULT_META_URL = "/data/asteroid-phase1/asteroid_phase1_main_100000.meta.json";
var PHASE1_DEFAULT_MAX_RECORDS = 15e3;
var PHASE1_LOAD_LATENCY_BUDGET_MS = 2e3;
var ASPH_MAGIC = "ASPH";
var ACBF_MAGIC = "ACBF";
var HEADER_SIZE_BYTES = 12;
var EXPECTED_PHASE1_VERSION = ["ASPH-v1", "ASPH-v2", "ACBF-v1"];
var EXPECTED_TAXONOMIES = ["C", "S", "M"];
var DEFAULT_PHASE1_EPOCH_JD = 2451545;
var TAXONOMY_LABEL_BY_VALUE = {
  [0 /* C */]: "C",
  [1 /* S */]: "S",
  [2 /* M */]: "M"
};
function nowMs() {
  return typeof performance === "object" && typeof performance.now === "function" ? performance.now() : Date.now();
}
function normalizeChecksum(value) {
  if (typeof value !== "string") return void 0;
  const normalized = value.trim().toLowerCase();
  if (!normalized.length) return void 0;
  return normalized.startsWith("0x") ? normalized.slice(2) : normalized;
}
function isSha256Hex(value) {
  return /^[0-9a-f]{64}$/u.test(value);
}
function mulberry322(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clampRange(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
function buildOrbitSeed(aAu, i, taxonomy, anomalyDeg) {
  return (Math.trunc(aAu * 1e5) ^ i * 97 ^ Math.trunc(anomalyDeg * 100)) >>> 0;
}
function buildPaletteColor(taxonomy, seed) {
  const baseColor = makeColor(taxonomy, seed);
  return Number.isFinite(baseColor) ? baseColor : colorForTaxonomy(taxonomy, mulberry322(seed + 1));
}
function safeOrbitNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function safePositiveOrbitNumber(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}
function safePeriodDays(value, fallbackAu) {
  if (!Number.isFinite(value) || value <= 0) return 365.25 * Math.pow(fallbackAu, 1.5);
  return value;
}
function toAsteroidDef(record, index) {
  const aAu = safePositiveOrbitNumber(record.aAu, 2.8);
  const taxonomy = taxonomyFromIndex(record.taxonomyIndex, aAu);
  const taxonomySeed = buildOrbitSeed(aAu, index, taxonomy, record.meanAnomalyDeg);
  const safeE = clampRange(record.e, 0, 1);
  const safeDiameter = safePositiveOrbitNumber(record.diameterKm, 1);
  const safeAlbedo = safeOrbitNumber(record.albedo, albedoForTaxonomy(taxonomy, mulberry322(taxonomySeed + 2)));
  const safeAlbedoFinal = safeAlbedo <= 0 ? albedoForTaxonomy(taxonomy, mulberry322(taxonomySeed + 3)) : safeAlbedo;
  const color = buildPaletteColor(taxonomy, taxonomySeed);
  return {
    orbit: {
      epochJd: safeOrbitNumber(record.epochJd, DEFAULT_PHASE1_EPOCH_JD),
      aAu,
      e: safeE,
      iDeg: safeOrbitNumber(record.iDeg, 0),
      ascendingNodeDeg: safeOrbitNumber(record.ascendingNodeDeg, 0),
      argPeriapsisDeg: safeOrbitNumber(record.argPeriapsisDeg, 0),
      meanAnomalyDeg: safeOrbitNumber(record.meanAnomalyDeg, 0),
      periodDays: safePeriodDays(record.periodDays, aAu)
    },
    taxonomy,
    diameterKm: safeDiameter,
    albedo: safeAlbedoFinal,
    color,
    irregularity: irregularityFromDiameter(safeDiameter),
    sourceId: String(record.sourceIdRaw)
  };
}
function parseAcbfRecord(record, index) {
  return toAsteroidDef({
    sourceIdRaw: record.sourceId,
    epochJd: record.epochJd,
    aAu: record.aAu,
    e: record.e,
    iDeg: record.iDeg,
    ascendingNodeDeg: record.ascendingNodeDeg,
    argPeriapsisDeg: record.argPeriapsisDeg,
    meanAnomalyDeg: record.meanAnomalyDeg,
    periodDays: record.periodDays,
    diameterKm: record.diameterKm,
    albedo: record.albedo,
    taxonomyIndex: record.taxonomyIndex
  }, index);
}
function parseAsphRecord(payload, dataOffset, index, version) {
  const read = (offset) => payload.getFloat32(offset, true);
  const sourceIdRaw = version === 2 ? payload.getUint32(dataOffset, true) : index + 1;
  const baseOffset = version === 2 ? dataOffset + 4 : dataOffset;
  const epochJd = read(baseOffset);
  const aAu = read(baseOffset + 4);
  const e = read(baseOffset + 8);
  const iDeg = read(baseOffset + 12);
  const ascendingNodeDeg = read(baseOffset + 16);
  const argPeriapsisDeg = read(baseOffset + 20);
  const meanAnomalyDeg = read(baseOffset + 24);
  const periodDays = read(baseOffset + 28);
  const diameterKm = read(baseOffset + 32);
  const albedo = read(baseOffset + 36);
  const taxonomyIndex = read(baseOffset + 40);
  return {
    version,
    sourceIdRaw,
    epochJd,
    aAu,
    e,
    iDeg,
    ascendingNodeDeg,
    argPeriapsisDeg,
    meanAnomalyDeg,
    periodDays,
    diameterKm,
    albedo,
    taxonomyIndex
  };
}
function taxonomyFromIndex(raw, aAu) {
  const index = Math.round(raw);
  if (index === 1) return 1 /* S */;
  if (index === 2) return 2 /* M */;
  if (index === 0) return 0 /* C */;
  if (aAu < 2.5) return 1 /* S */;
  if (aAu > 2.7) return 0 /* C */;
  return 2 /* M */;
}
function irregularityFromDiameter(diameterKm) {
  if (diameterKm > 200) return 0.02 + Math.min(0.05, (diameterKm - 200) / 4e4);
  if (diameterKm > 50) return 0.05 + Math.min(0.15, Math.sqrt(diameterKm - 50) / 60);
  return 0.1 + Math.min(0.3, Math.sqrt(diameterKm) / 20);
}
function makeColor(taxonomy, seed) {
  const rng = mulberry322(seed);
  return colorForTaxonomy(taxonomy, rng);
}
async function checksumSHA256(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = "";
  for (let i = 0; i < hashArray.length; i += 1) {
    hex += hashArray[i].toString(16).padStart(2, "0");
  }
  return hex;
}
function parseTaxonomyCounts(asteroids) {
  const counts = { C: 0, S: 0, M: 0 };
  for (const asteroid of asteroids) {
    const label = TAXONOMY_LABEL_BY_VALUE[asteroid.taxonomy];
    if (counts[label] == null) continue;
    counts[label] += 1;
  }
  return counts;
}
function extractMetaNumber(meta, keys) {
  if (!meta) return void 0;
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return void 0;
}
function extractExpectedChecksum(meta) {
  if (!meta) return {};
  const rec = meta;
  const declaredAlgorithm = rec.checksum_algorithm_sha256;
  if (declaredAlgorithm != null && (typeof declaredAlgorithm !== "string" || declaredAlgorithm.trim().toLowerCase().replace("-", "") !== "sha256")) {
    return {
      code: "sha256-invalid",
      reason: "Metadata checksum_algorithm_sha256 must identify SHA-256."
    };
  }
  const sha256Keys = ["checksum_sha256", "checksumSha256", "sha256", "sha256_hex", "sha256Hex"];
  for (const key of sha256Keys) {
    if (!(key in rec)) continue;
    const value = normalizeChecksum(rec[key]);
    if (value && isSha256Hex(value)) {
      return { expected: { value, algorithm: "sha256" } };
    }
    return {
      code: "sha256-invalid",
      reason: `Metadata field ${key} must contain exactly 64 hexadecimal SHA-256 characters.`
    };
  }
  return {
    code: "sha256-missing",
    reason: "Metadata must declare a SHA-256 checksum; FNV and unspecified hashes are not integrity substitutes."
  };
}
function buildRowAcceptance(sourceCount, parsedCount, requestedMax, meta) {
  const metaSourceRows = extractMetaNumber(meta, ["source_rows", "sourceRows"]);
  const metaStoredCount = extractMetaNumber(meta, ["stored_count", "storedCount"]);
  const capped = sourceCount > requestedMax;
  const parsedMatchesExpectation = parsedCount === Math.min(requestedMax, sourceCount);
  const reasons = [];
  if (sourceCount <= 0) reasons.push("sourceCount=0");
  if (parsedCount <= 0) reasons.push("parsedCount=0");
  if (!parsedMatchesExpectation) reasons.push(`parsedCount ${parsedCount} != min(requestedMax, sourceCount)=${Math.min(requestedMax, sourceCount)}`);
  if (metaSourceRows != null && metaSourceRows !== sourceCount) reasons.push(`meta.source_rows=${metaSourceRows} != sourceCount=${sourceCount}`);
  if (metaStoredCount != null && metaStoredCount !== sourceCount) reasons.push(`meta.stored_count=${metaStoredCount} != sourceCount=${sourceCount}`);
  const passed = reasons.length === 0;
  return {
    sourceCount,
    parsedCount,
    requestedMax,
    capped,
    metadataSourceRows: metaSourceRows,
    metadataStoredCount: metaStoredCount,
    passed,
    code: passed ? void 0 : "row-count-invalid",
    reason: passed ? void 0 : reasons.join("; ")
  };
}
function buildTaxonomyAcceptance(asteroids) {
  const counts = parseTaxonomyCounts(asteroids);
  const present = EXPECTED_TAXONOMIES.filter((code) => counts[code] > 0);
  const completeness = present.length / EXPECTED_TAXONOMIES.length;
  const reasons = [];
  for (const code of EXPECTED_TAXONOMIES) {
    if (counts[code] === 0) reasons.push(`missing taxonomy ${code}`);
  }
  if (!asteroids.length) reasons.push("no asteroid rows");
  const passed = reasons.length === 0;
  return {
    counts,
    present,
    expected: [...EXPECTED_TAXONOMIES],
    completeness,
    passed,
    code: passed ? void 0 : "taxonomy-incomplete",
    reason: passed ? void 0 : reasons.join("; ")
  };
}
function buildChecksumAcceptance(metadataAcceptance, resolution, actual, checksumFailureReason) {
  if (!metadataAcceptance.passed) {
    return {
      expected: void 0,
      actual,
      enforced: true,
      passed: false,
      reason: "A trusted SHA-256 checksum cannot be established without valid metadata."
    };
  }
  if (resolution.code) {
    return {
      expected: void 0,
      actual,
      enforced: true,
      passed: false,
      code: resolution.code,
      reason: resolution.reason
    };
  }
  const expected = resolution.expected;
  if (!expected) {
    return {
      expected: void 0,
      actual,
      enforced: true,
      passed: false,
      code: "sha256-missing",
      reason: "Metadata must declare a valid SHA-256 checksum."
    };
  }
  if (checksumFailureReason) {
    return {
      expected: expected.value,
      actual,
      enforced: true,
      passed: false,
      code: "sha256-unavailable",
      reason: checksumFailureReason
    };
  }
  const matched = actual === expected.value;
  return {
    expected: expected.value,
    actual,
    enforced: true,
    passed: matched,
    code: matched ? void 0 : "sha256-mismatch",
    reason: matched ? void 0 : `SHA-256 mismatch: expected=${expected.value}, actual=${actual}`
  };
}
function buildLatencyAcceptance(loadMs, budgetMs) {
  const reason = loadMs <= budgetMs ? void 0 : `loadMs=${loadMs.toFixed(1)} exceeded budgetMs=${budgetMs}`;
  return {
    loadMs,
    budgetMs,
    passed: loadMs <= budgetMs,
    reason
  };
}
function buildAcceptance(parsed, options) {
  const catalogSignature = `${parsed.catalogMagic}-v${parsed.catalogVersion}`;
  const expected = EXPECTED_PHASE1_VERSION.includes(catalogSignature);
  const version = {
    expected: EXPECTED_PHASE1_VERSION.join(", "),
    actual: catalogSignature,
    passed: expected,
    code: expected ? void 0 : "unsupported-catalog-version",
    reason: expected ? void 0 : `Unsupported catalog signature ${catalogSignature} (expected ${EXPECTED_PHASE1_VERSION.join(", ")}).`
  };
  const rows = buildRowAcceptance(
    parsed.sourceCount,
    parsed.asteroids.length,
    options.requestedMax,
    options.metadata
  );
  const taxonomy = buildTaxonomyAcceptance(parsed.asteroids);
  const checksum = buildChecksumAcceptance(
    options.metadataAcceptance,
    options.checksumResolution,
    options.checksumActual,
    options.checksumFailureReason
  );
  const latency = buildLatencyAcceptance(options.loadMs, options.latencyBudgetMs);
  const rejectionItems = [
    options.metadataAcceptance,
    version,
    rows,
    taxonomy,
    checksum
  ];
  const rejections = rejectionItems.flatMap((item) => !item.passed && item.code && item.reason ? [{ code: item.code, message: item.reason }] : []);
  return {
    metadata: options.metadataAcceptance,
    version,
    rows,
    taxonomy,
    checksum,
    latency,
    rejections,
    passed: options.metadataAcceptance.passed && version.passed && rows.passed && taxonomy.passed && checksum.passed
  };
}
async function loadPhase1CatalogMetadata(url) {
  if (!url) {
    return {
      acceptance: {
        status: "missing",
        passed: false,
        code: "metadata-missing",
        reason: "Phase-1 catalog metadata URL is missing."
      }
    };
  }
  let response;
  try {
    response = await fetch(url, { cache: "no-cache" });
  } catch (error2) {
    const message = error2 instanceof Error ? error2.message : String(error2);
    return {
      acceptance: {
        status: "fetch-failed",
        passed: false,
        code: "metadata-fetch-failed",
        reason: `Failed to fetch Phase-1 catalog metadata: ${message}`
      }
    };
  }
  if (!response.ok) {
    const missing = response.status === 404 || response.status === 410;
    return {
      acceptance: {
        status: missing ? "missing" : "fetch-failed",
        httpStatus: response.status,
        passed: false,
        code: missing ? "metadata-missing" : "metadata-fetch-failed",
        reason: `Failed to fetch Phase-1 catalog metadata (${response.status}): ${response.statusText}`
      }
    };
  }
  try {
    const payload = await response.json();
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      return {
        metadata: payload,
        acceptance: {
          status: "loaded",
          passed: true
        }
      };
    }
  } catch {
  }
  return {
    acceptance: {
      status: "invalid",
      passed: false,
      code: "metadata-invalid",
      reason: "Phase-1 catalog metadata is not a valid JSON object."
    }
  };
}
function parseOrbitCatalog(buffer, maxCount) {
  if (buffer.byteLength < HEADER_SIZE_BYTES) {
    throw new Error("Phase-1 binary payload is too small for header.");
  }
  const headerBytes = new Uint8Array(buffer, 0, 4);
  const magic = String.fromCharCode(headerBytes[0], headerBytes[1], headerBytes[2], headerBytes[3]);
  if (magic === ASPH_MAGIC) {
    const header = new DataView(buffer);
    const version = header.getUint8(4);
    if (version !== 1 && version !== 2) {
      throw new Error(`Unsupported ASPH catalog version: ${version}`);
    }
    const stride = header.getUint8(5);
    const expectedStride = version === 2 ? 12 : 11;
    if (stride !== expectedStride) {
      throw new Error(`Unexpected ASPH stride: ${stride} (expected ${expectedStride})`);
    }
    const count = header.getUint32(8, true);
    const payloadStart = HEADER_SIZE_BYTES;
    const strideBytes = stride * 4;
    const expectedBytes = payloadStart + count * strideBytes;
    if (buffer.byteLength < expectedBytes) {
      throw new Error(`ASPH payload truncated: expected ${expectedBytes}, got ${buffer.byteLength}`);
    }
    const payload = new DataView(buffer, payloadStart, count * strideBytes);
    const limit = Math.max(0, Math.min(maxCount, count));
    const asteroids = [];
    asteroids.length = limit;
    for (let i = 0; i < limit; i += 1) {
      const baseOffset = i * strideBytes;
      const parsed = parseAsphRecord(payload, baseOffset, i, version);
      asteroids[i] = toAsteroidDef(parsed, i);
    }
    return {
      asteroids,
      sourceCount: count,
      catalogVersion: version,
      catalogMagic: ASPH_MAGIC
    };
  }
  if (magic === ACBF_MAGIC) {
    const parsed = readAsteroidCatalogBinary(buffer, { maxRecords: maxCount });
    const limit = Math.max(0, Math.min(maxCount, parsed.records.length));
    const asteroids = Array.from({ length: limit }, (_, i) => parseAcbfRecord(parsed.records[i], i));
    return {
      asteroids,
      sourceCount: parsed.header.recordCount,
      catalogVersion: parsed.header.version,
      catalogMagic: ACBF_MAGIC
    };
  }
  throw new Error(`Unknown phase-1 magic "${magic}". Expected ${ASPH_MAGIC} or ${ACBF_MAGIC}.`);
}
async function loadPhase1AsteroidCatalog(options = {}) {
  const url = options.url ?? PHASE1_DEFAULT_URL;
  const metaUrl = options.metaUrl ?? PHASE1_DEFAULT_META_URL;
  const maxRecords = options.maxRecords ?? PHASE1_DEFAULT_MAX_RECORDS;
  const latencyBudgetMs = options.loadLatencyBudgetMs ?? PHASE1_LOAD_LATENCY_BUDGET_MS;
  const loadStarted = nowMs();
  const [binaryResponse, metadataLoad] = await Promise.all([
    fetch(url),
    loadPhase1CatalogMetadata(metaUrl)
  ]);
  if (!binaryResponse.ok) {
    throw new Error(`Failed to fetch phase-1 catalog (${binaryResponse.status}): ${binaryResponse.statusText}`);
  }
  const buffer = await binaryResponse.arrayBuffer();
  const parsed = parseOrbitCatalog(buffer, maxRecords);
  const metadata = metadataLoad.metadata;
  const checksumResolution = extractExpectedChecksum(metadata);
  let checksumActual = "";
  let checksumFailureReason;
  try {
    checksumActual = await checksumSHA256(buffer);
  } catch (error2) {
    const message = error2 instanceof Error ? error2.message : String(error2);
    checksumFailureReason = `Unable to compute SHA-256 for the Phase-1 catalog: ${message}`;
  }
  const loadMs = nowMs() - loadStarted;
  const acceptance = buildAcceptance(parsed, {
    requestedMax: maxRecords,
    metadata,
    loadMs,
    latencyBudgetMs,
    metadataAcceptance: metadataLoad.acceptance,
    checksumResolution,
    checksumActual,
    checksumFailureReason
  });
  const rowCount = acceptance.rows;
  const taxonomyCheck = acceptance.taxonomy;
  return {
    asteroids: parsed.asteroids,
    sourceCount: parsed.sourceCount,
    loadedCount: parsed.asteroids.length,
    catalogVersion: parsed.catalogVersion,
    acceptance,
    checksumActual,
    checksumExpected: checksumResolution.expected?.value,
    rowCount,
    taxonomyCheck,
    rejectionReasons: acceptance.rejections,
    accepted: acceptance.passed,
    loadMs,
    loadLatencyBudgetMs: latencyBudgetMs,
    meta: metadata
  };
}

// agent-notes/CODEBASE_SCAN_2026-10-10_EVIDENCE/physics/frontend-main.mjs
import { readFileSync } from "node:fs";
var maxResidual = 0;
var worstM = 0;
for (let i = 0; i <= 1e4; i++) {
  const M = i / 1e4 * Math.PI * 2;
  const E = solveKeplerFast(M, 0.99);
  const r = Math.abs(E - 0.99 * Math.sin(E) - M);
  if (r > maxResidual) {
    maxResidual = r;
    worstM = M;
  }
}
var derivatives = PLANETS.filter((p) => p.orbit.secularRates).map((p) => ({ id: p.id, epochs: [0, 9775.12345, 18262.5].map((t) => ({ elapsedDays: t, stepResults: [0.01, 1e-3, 1e-4].map((h) => {
  let pos = new Vector3(), v = new Vector3(), a = new Vector3(), b = new Vector3();
  propagateKeplerOrbit(p.orbit, t, pos, v);
  propagateKeplerOrbit(p.orbit, t - h, a);
  propagateKeplerOrbit(p.orbit, t + h, b);
  return { h, velocity_derivative_difference_m_s: b.sub(a).multiplyScalar(1 / (2 * h)).sub(v).length() * 149597870700 / 86400 };
}) })) }));
var model = new SolarSystemModel({ bodies: PLANETS.map((p) => ({ id: p.id, orbit: p.orbit })) });
model.update(2461320);
var before = model.getWorldPosition("earth");
model.applyMetricKinematics(new Vector3(1, 0, 0), 1, () => 1e-12, 1e21, 1e12);
var after = model.getWorldPosition("earth");
var sampled = model.sampleBodyStateAt("earth", 2461320);
globalThis.fetch = async (url) => {
  let p = "/tmp/solar-sweep-2026-10-10-j1gnowo_/main/public" + String(url);
  const b = readFileSync(p);
  return new Response(b, { status: 200 });
};
var cat = await loadPhase1AsteroidCatalog({ maxRecords: 1e5 });
var fits = parseMoonEphemerisArtifact(JSON.parse(readFileSync("/tmp/solar-sweep-2026-10-10-j1gnowo_/main/src/data/moonEphemerisChebyshev.json", "utf8")));
var fitted = createSolarSystemCatalog({ moonEphemerides: fits.bodies });
var moons2 = fitted.bodies.filter((b) => b.type === "moon");
var out = { snapshot: "/tmp/solar-sweep-2026-10-10-j1gnowo_/main", float32_jd: { jd: 2461320125e-3, rounded: Math.fround(2461320125e-3), error_days: Math.fround(2461320125e-3) - 2461320125e-3, ulp_days: Math.fround(246132025e-2) - Math.fround(2461320) }, acbf_roundtrip: validatePackedCatalogRoundTrip100k(), fast_kepler: { eccentricity: 0.99, max_residual_radians: maxResidual, mean_anomaly: worstM }, schwarzschild: [SGR_A, M87].map((s) => ({ source: s.key, stored_cm: s.rSchwarzschildCm, stored_au: s.rSchwarzschildCm / AU_CM, from_local_G_M_c_cm: 2 * G_CGS * s.massG / (C_CM_S * C_CM_S), ratio: 2 * G_CGS * s.massG / (C_CM_S * C_CM_S * s.rSchwarzschildCm) })), secular_velocity_derivatives: derivatives, warp_canonical_state: { world_position_displacement_au: after.clone().sub(before).toArray(), world_versus_sample_au: after.clone().sub(sampled.position).toArray() }, catalog_actual: { accepted: cat.accepted, loaded: cat.loadedCount, source: cat.sourceCount, sha: cat.checksumActual, eccentricity_max: Math.max(...cat.asteroids.map((a) => a.orbit.e)), epoch_distinct: [...new Set(cat.asteroids.map((a) => a.orbit.epochJd))].slice(0, 30) }, moons: { count: moons2.length, fitted_count: moons2.filter((m) => m.orbit.ephemeris).length, required_count: moons2.filter((m) => m.orbit.ephemerisRequired).length, fits: Object.keys(fits.bodies) } };
console.log(JSON.stringify(out, null, 2));
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2025 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
