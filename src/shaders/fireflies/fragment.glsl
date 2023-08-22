void main() {
  float distanceToCoord = distance(gl_PointCoord, vec2(0.5));
  float strength = 0.05 / distanceToCoord - 0.1;
  gl_FragColor = vec4(1.0, 1.0, 1.0, strength);
}