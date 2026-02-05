/**
 * Crypto Module
 * CryptoJS-compatible AES decryption for graph.hangout.audio encrypted measurements
 * 
 * The server encrypts measurement data using CryptoJS AES with a JSON format:
 *   { "ct": "<base64 ciphertext>", "iv": "<hex IV>", "s": "<hex salt>" }
 * The passphrase is a UUIDv4 sent with the request.
 * 
 * CryptoJS uses OpenSSL's EVP_BytesToKey for key derivation from a passphrase + salt.
 */

const crypto = require('crypto');

// ============================================================================
// EVP_BytesToKey - OpenSSL key derivation (used by CryptoJS)
// ============================================================================

/**
 * Derive key and IV from passphrase and salt using OpenSSL's EVP_BytesToKey
 * CryptoJS uses MD5, 256-bit key, 128-bit IV for AES-256-CBC
 */
function evpBytesToKey(password, salt, keyLen = 32, ivLen = 16) {
  const passwordBuf = Buffer.from(password, 'utf-8');
  const data = Buffer.concat([passwordBuf, salt]);
  
  const blocks = [];
  let lastHash = null;
  let totalLen = 0;
  
  while (totalLen < keyLen + ivLen) {
    const input = lastHash ? Buffer.concat([lastHash, data]) : data;
    lastHash = crypto.createHash('md5').update(input).digest();
    blocks.push(lastHash);
    totalLen += lastHash.length;
  }
  
  const derived = Buffer.concat(blocks);
  return {
    key: derived.subarray(0, keyLen),
    iv: derived.subarray(keyLen, keyLen + ivLen)
  };
}

// ============================================================================
// AES DECRYPTION (CryptoJS JSON format compatible)
// ============================================================================

/**
 * Decrypt a CryptoJS AES JSON-formatted string
 * @param {string} jsonStr - JSON string with format: {"ct":"<base64>","iv":"<hex>","s":"<hex>"}
 * @param {string} passphrase - The passphrase (UUIDv4) used for encryption
 * @returns {string} Decrypted plaintext
 */
function decryptAesJson(jsonStr, passphrase) {
  const parsed = JSON.parse(jsonStr);
  
  const ciphertext = Buffer.from(parsed.ct, 'base64');
  const salt = Buffer.from(parsed.s, 'hex');
  
  // Derive key and IV from passphrase + salt (EVP_BytesToKey with MD5)
  const { key, iv } = evpBytesToKey(passphrase, salt);
  
  // If an explicit IV is provided, use it instead of the derived one
  const actualIv = parsed.iv ? Buffer.from(parsed.iv, 'hex') : iv;
  
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, actualIv);
  let decrypted = decipher.update(ciphertext, undefined, 'utf-8');
  decrypted += decipher.final('utf-8');
  
  // CryptoJS wraps the value in JSON.stringify, so the result is a JSON string
  // e.g. "\"freq\\tdB\\n20\\t-5.2\\n...\"" — we need to JSON.parse it
  return JSON.parse(decrypted);
}

module.exports = {
  decryptAesJson
};
