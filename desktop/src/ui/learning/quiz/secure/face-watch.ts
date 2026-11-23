import { SECURE_LIMITS } from '../../../../../../server/src/shared/api/integrity';

// Turns a stream of "faces seen" counts into at most one report per episode. A face that is
// gone for about 12 seconds, or a second face for two checks in a row, is reported once and
// is not reported again until things look normal. Looking down at the keyboard is normal.

export type FaceFinding = 'FACE_MISSING' | 'FACE_MULTIPLE';

export class FaceWatch {
  private empty = 0;
  private crowded = 0;
  private missingReported = false;
  private multipleReported = false;

  feed(faces: number): FaceFinding | null {
    if (faces === 0) {
      this.empty += 1;
      this.crowded = 0;
      this.multipleReported = false;
      if (!this.missingReported && this.empty >= SECURE_LIMITS.faceMissingAfterChecks) {
        this.missingReported = true;
        return 'FACE_MISSING';
      }
      return null;
    }
    this.empty = 0;
    this.missingReported = false;
    if (faces >= 2) {
      this.crowded += 1;
      if (!this.multipleReported && this.crowded >= 2) {
        this.multipleReported = true;
        return 'FACE_MULTIPLE';
      }
      return null;
    }
    this.crowded = 0;
    this.multipleReported = false;
    return null;
  }
}
