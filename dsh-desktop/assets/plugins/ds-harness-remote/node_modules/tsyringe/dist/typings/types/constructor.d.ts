/** Constructor type */
declare type constructor<T> = {
    new (...args: any[]): T;
};
export default constructor;
