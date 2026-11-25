import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { apiError } from '../api-error.js';

/** Path UUID validation with the contract `INVALID_ID` error. */
@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_ID',
        'The identifier is not valid.',
      );
    }
    return value;
  }
}
