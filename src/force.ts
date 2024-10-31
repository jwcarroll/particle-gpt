import { Vector } from "./vector";


export class Force extends Vector {
  private _name: string;

  public get name() {
    return this._name;
  }

  constructor(name: string, x: number, y: number) {
    super(x, y);
    this._name = name;
  }

  static fromVector(name: string, vector: Vector) {
    return new Force(name, vector.x, vector.y);
  }
}
