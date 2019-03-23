const BN = require('bn.js')
const _ = require('lodash')
const $ = require('../util/preconditions')

const reversebuf = function(buf) {
  const buf2 = Buffer.alloc(buf.length)
  for (let i = 0; i < buf.length; i += 1) {
    buf2[i] = buf[buf.length - 1 - i]
  }
  return buf2
}

BN.Zero = new BN(0)
BN.One = new BN(1)
BN.Minus1 = new BN(-1)

BN.fromNumber = function(n) {
  $.checkArgument(_.isNumber(n))
  return new BN(n)
}

BN.fromString = function(str, base) {
  $.checkArgument(_.isString(str))
  return new BN(str, base)
}

BN.fromBuffer = function(buf, opts) {
  if (typeof opts !== 'undefined' && opts.endian === 'little') {
    buf = reversebuf(buf)
  }
  const hex = buf.toString('hex')
  const bn = new BN(hex, 16)
  return bn
}

/**
 * Instantiate a BigNumber from a "signed magnitude buffer"
 * (a buffer where the most significant bit represents the sign (0 = positive, -1 = negative))
 */
BN.fromSM = function(buf, opts) {
  let ret
  if (buf.length === 0) {
    return BN.fromBuffer(Buffer.from([0]))
  }

  let endian = 'big'
  if (opts) {
    ;({ endian } = opts)
  }
  if (endian === 'little') {
    buf = reversebuf(buf)
  }

  if (buf[0] & 0x80) {
    buf[0] &= 0x7f
    ret = BN.fromBuffer(buf)
    ret.neg().copy(ret)
  } else {
    ret = BN.fromBuffer(buf)
  }
  return ret
}

BN.prototype.toNumber = function() {
  return parseInt(this.toString(10), 10)
}

BN.prototype.toBuffer = function(opts) {
  let buf
  let hex
  if (opts && opts.size) {
    hex = this.toString(16, 2)
    const natlen = hex.length / 2
    buf = Buffer.from(hex, 'hex')

    if (natlen > opts.size) {
      buf = BN.trim(buf, natlen)
    } else if (natlen < opts.size) {
      buf = BN.pad(buf, natlen, opts.size)
    }
  } else {
    hex = this.toString(16, 2)
    buf = Buffer.from(hex, 'hex')
  }

  if (typeof opts !== 'undefined' && opts.endian === 'little') {
    buf = reversebuf(buf)
  }

  return buf
}

BN.prototype.toSMBigEndian = function() {
  let buf
  if (this.cmp(BN.Zero) === -1) {
    buf = this.neg().toBuffer()
    if (buf[0] & 0x80) {
      buf = Buffer.concat([Buffer.from([0x80]), buf])
    } else {
      buf[0] |= 0x80
    }
  } else {
    buf = this.toBuffer()
    if (buf[0] & 0x80) {
      buf = Buffer.concat([Buffer.from([0x00]), buf])
    }
  }

  if ((buf.length === 1) & (buf[0] === 0)) {
    buf = Buffer.from([])
  }
  return buf
}

BN.prototype.toSM = function(opts) {
  const endian = opts ? opts.endian : 'big'
  let buf = this.toSMBigEndian()

  if (endian === 'little') {
    buf = reversebuf(buf)
  }
  return buf
}

/**
 * Create a BN from a "ScriptNum":
 * This is analogous to the constructor for CScriptNum in bitcoind. Many ops in
 * bitcoind's script interpreter use CScriptNum, which is not really a proper
 * bignum. Instead, an error is thrown if trying to input a number bigger than
 * 4 bytes. We copy that behavior here. A third argument, `size`, is provided to
 * extend the hard limit of 4 bytes, as some usages require more than 4 bytes.
 */
BN.fromScriptNumBuffer = function(buf, fRequireMinimal, size) {
  const nMaxNumSize = size || 4
  $.checkArgument(buf.length <= nMaxNumSize, new Error('script number overflow'))
  if (fRequireMinimal && buf.length > 0) {
    // Check that the number is encoded with the minimum possible
    // number of bytes.
    //
    // If the most-significant-byte - excluding the sign bit - is zero
    // then we're not minimal. Note how this test also rejects the
    // negative-zero encoding, 0x80.
    if ((buf[buf.length - 1] & 0x7f) === 0) {
      // One exception: if there's more than one byte and the most
      // significant bit of the second-most-significant-byte is set
      // it would conflict with the sign bit. An example of this case
      // is +-255, which encode to 0xff00 and 0xff80 respectively.
      // (big-endian).
      if (buf.length <= 1 || (buf[buf.length - 2] & 0x80) === 0) {
        throw new Error('non-minimally encoded script number')
      }
    }
  }
  return BN.fromSM(buf, {
    endian: 'little',
  })
}

/**
 * The corollary to the above, with the notable exception that we do not throw
 * an error if the output is larger than four bytes. (Which can happen if
 * performing a numerical operation that results in an overflow to more than 4
 * bytes).
 */
BN.prototype.toScriptNumBuffer = function() {
  return this.toSM({
    endian: 'little',
  })
}

BN.trim = function(buf, natlen) {
  return buf.slice(natlen - buf.length, buf.length)
}

BN.pad = function(buf, natlen, size) {
  const rbuf = Buffer.alloc(size)
  for (let i = 0; i < buf.length; i += 1) {
    rbuf[rbuf.length - 1 - i] = buf[buf.length - 1 - i]
  }
  for (let i = 0; i < size - natlen; i += 1) {
    rbuf[i] = 0
  }
  return rbuf
}

module.exports = BN
