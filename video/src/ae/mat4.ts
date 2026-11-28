// 4x4 column-major matrix helpers for the AE->Remotion interpreter.
// Vectors are [x,y,z]; matrices are number[16] in column-major order
// (m[0..3] = first column) matching CSS matrix3d ordering.

export type Mat4 = number[]; // length 16, column-major

export function mIdentity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mMultiply(a: Mat4, b: Mat4): Mat4 {
  // a * b
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export function mTranslation(x: number, y: number, z = 0): Mat4 {
  const m = mIdentity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function mScale(x: number, y: number, z = 1): Mat4 {
  const m = mIdentity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

export function mRotateX(deg: number): Mat4 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

export function mRotateY(deg: number): Mat4 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

export function mRotateZ(deg: number): Mat4 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mPerspective(fovDeg: number, aspect: number, near = 0.1, far = 10000): Mat4 {
  // OpenGL-style perspective, column-major, maps view space -> clip space.
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const m = new Array(16).fill(0);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function mLookAt(eye: number[], center: number[], up: number[]): Mat4 {
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len;
  zy /= len;
  zz /= len;
  // x = up x z
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len;
  xy /= len;
  xz /= len;
  // y = z x x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return [
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ];
}

// NDC -> screen pixels (y down). clip: x,y in [-1,1], z ignored.
export function mScreenFromClip(w: number, h: number): Mat4 {
  return [
    w / 2, 0, 0, 0,
    0, -h / 2, 0, 0,
    0, 0, 1, 0,
    w / 2, h / 2, 0, 1,
  ];
}

export function transformPoint(m: Mat4, x: number, y: number, z: number): number[] {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

// CSS matrix3d string. CSS uses column-major too but its basis differs:
// CSS matrix3d(a1..a16) maps (x,y,z,1) with the SAME column-major layout,
// except the 4th column holds translation? No — CSS matrix3d is:
// | a1 a5 a9  a13 |
// | a2 a6 a10 a14 |
// | a3 a7 a11 a15 |
// | a4 a8 a12 a16 |  applied to column vector (x,y,z,1).
// That equals our column-major m[c*4+r] -> css index c*4+r? css a_{r + 4c +1}
// is element row r col c -> index r + 4*c (0-based) same as ours. Good.
export function cssMatrix3d(m: Mat4): string {
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-10 ? 0 : +v.toFixed(6))).join(",")})`;
}
