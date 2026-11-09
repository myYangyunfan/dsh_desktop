import { KeyAgreeRecipientInfo } from "./key_agree_recipient_info";
import { KeyTransRecipientInfo } from "./key_trans_recipient_info";
import { KEKRecipientInfo } from "./kek_recipient_info";
import { PasswordRecipientInfo } from "./password_recipient_info";
/**
 * ```asn
 * OtherRecipientInfo ::= SEQUENCE {
 *  oriType OBJECT IDENTIFIER,
 *  oriValue ANY DEFINED BY oriType }
 * ```
 */
export declare class OtherRecipientInfo {
    oriType: string;
    oriValue: ArrayBuffer;
    constructor(params?: Partial<OtherRecipientInfo>);
}
/**
 * ```asn
 * RecipientInfo ::= CHOICE {
 *  ktri KeyTransRecipientInfo,
 *  kari [1] KeyAgreeRecipientInfo,
 *  kekri [2] KEKRecipientInfo,
 *  pwri [3] PasswordRecipientInfo,
 *  ori [4] OtherRecipientInfo }
 * ```
 */
export declare class RecipientInfo {
    ktri?: KeyTransRecipientInfo;
    kari?: KeyAgreeRecipientInfo;
    kekri?: KEKRecipientInfo;
    pwri?: PasswordRecipientInfo;
    ori?: OtherRecipientInfo;
    constructor(params?: Partial<RecipientInfo>);
}
