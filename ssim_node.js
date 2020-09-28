module.exports = function (RED) {

    function SSIM(config) {
        var SSIM = require('ssim.js');
        var Jimp = require('jimp');
        const isBase64 = require('is-base64');
        const _prefixURIMap = {
            "iVBOR": "data:image/png;base64,",
            "R0lGO": "data:image/gif;base64,",
            "/9j/4": "data:image/jpeg;base64,",
            "Qk02U": "data:image/bmp;base64,"
        }
        const createDataURI = function (rawImage) {
            let first5 = rawImage.substr(0, 5)
            if (_prefixURIMap[first5]) {
                return _prefixURIMap[first5] + rawImage;
            }
            return _prefixURIMap["iVBOR"] + rawImage;//default to png
        }


        RED.nodes.createNode(this, config);
        var node = this;
        node.greyscale = config.greyscale || false;
        node.baseline = config.baseline || "";
        node.baselineType = config.baselineType || "msg";
        node.image = config.image || "";
        node.imageType = config.imageType || "msg";

        node.on("input", function (msg) {
            //first clear any error status
            node.status({});
            var nodeStatusError = function (err, msg, statusText) {
                node.error(err, msg);
                node.status({fill: "red", shape: "dot", text: statusText});
            }

            var getImage = function (node, msg, data, dataType, processImage) {
                var dataInput = null;
                RED.util.evaluateNodeProperty(data, dataType, node, msg, (err, value) => {
                    if (err) {
                        node.error(err, msg);
                    } else {
                        dataInput = value;
                    }
                });
                if (dataInput == null) {
                    processImage("dataInput is null", null);
                    return;
                }

                let isBuffer = Buffer.isBuffer(dataInput);
                let hasMime = false, isBase64Image = false;
                if (typeof dataInput == "string") {
                    hasMime = dataInput.startsWith("data:");
                    isBase64Image = isBase64(dataInput, {mimeRequired: hasMime});
                    if (!isBase64Image) {
                        processImage("data is a string but not MIME or bas64 encoded image", null);
                        return;
                    }
                    if (!hasMime) {
                        dataInput = createDataURI(dataInput);
                        hasMime = true;
                    }
                }

                if (isBase64Image) {
                    if (hasMime) {
                        dataInput = dataInput.replace(/^data:image\/\w+;base64,/, "");//get data part only
                    }
                    Jimp.read(Buffer.from(dataInput, 'base64')).then(i => {
                        processImage(null, i);
                    }).catch(err => {
                        processImage(err, null);
                    });
                } else if (isBuffer) {
                    Jimp.read(dataInput).then(i => {
                        processImage(null, i);
                    }).catch(err => {
                        processImage(err, null);
                    });
                } else {
                    processImage(null, dataInput);
                }
            }

            try {
                getImage(node, msg, node.baseline, node.baselineType, function (err, baselineImage) {
                    if (!baselineImage) {
                        node.status({fill: "blue", shape: "dot", text: "No baseline image - SSIM: 0"});
                        msg["ssim"] = 0.0;
                        node.send(msg);
                    } else {
                        getImage(node, msg, node.image, node.imageType, function (err, image) {
                            if (!image) {
                                node.status({fill: "red", shape: "dot", text: "Error - Image is null"});
                                nodeStatusError("imageInput is not valid (Image parameter)", msg, "Error. Image is null");
                            } else {
                                const {mssim, performance} = SSIM.ssim(baselineImage.bitmap, image.bitmap);
                                node.status({fill: "green", shape: "dot", text: `SSIM: ${mssim} (${performance}ms)`});
                                msg["ssim"] = mssim;
                                node.send(msg);
                            }
                        });
                    }
                });
            } catch (e) {
                nodeStatusError(e, msg, "Error comparing images")
            }
        });

    }

    RED.nodes.registerType('ssim', SSIM)
};
