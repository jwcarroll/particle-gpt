export class Vector {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  public get length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  public get angle() {
    return Math.atan2(this.y, this.x);
  }

  public add(vector: Vector) {
    return new Vector(this.x + vector.x, this.y + vector.y);
  }

  public subtract(vector: Vector) {
    return new Vector(this.x - vector.x, this.y - vector.y);
  }

  public multiply(scalar: number) {
    return new Vector(this.x * scalar, this.y * scalar);
  }

  public divide(scalar: number) {
    return new Vector(this.x / scalar, this.y / scalar);
  }

  public normalize() {
    return this.divide(this.length);
  }

  public rotate(angle: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  public dot(vector: Vector) {
    return this.x * vector.x + this.y * vector.y;
  }

  public cross(vector: Vector) {
    return this.x * vector.y - this.y * vector.x;
  }

  public angleBetween(vector: Vector) {
    return Math.acos(this.dot(vector) / (this.length * vector.length));
  }

  public distanceTo(vector: Vector) {
    return this.subtract(vector).length;
  }

  public clone() {
    return new Vector(this.x, this.y);
  }

  public static fromAngle(angle: number, length: number = 1) {
    return new Vector(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  public static fromPoints(point1: Vector, point2: Vector) {
    return new Vector(point2.x - point1.x, point2.y - point1.y);
  }
}

export class Degree {
  private _value: number;

  constructor(value: number) {
    this._value = value;
  }

  public get value() {
    return this._value;
  }

  public get radians() {
    return this._value * (Math.PI / 180);
  }
}
