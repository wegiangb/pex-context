function equals(a,b){
    return a[0] == b[0] &&
           a[1] == b[1] &&
           a[2] == b[2] &&
           a[3] == b[3];
}

var Vec4 = {
    equals : equals
};

module.exports = Vec4;