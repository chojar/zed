/**
 * This module implements miscelaneous file operations (delete, rename)
 */
/* global define, _*/
define(function(require, exports, module) {
    plugin.consumes = ["ui", "eventbus", "command", "fs", "session_manager", "goto"];
    return plugin;

    function plugin(options, imports, register) {
        var async = require("async");
        var useragent = require("ace/lib/useragent");

        var ui = imports.ui;
        var eventbus = imports.eventbus;
        var command = imports.command;
        var fs = imports.fs;
        var session_manager = imports.session_manager;
        var goto = imports.goto;

        function confirmDelete(edit) {
            var path = edit.getSession().filename;
            ui.prompt({
                message: "Are you sure you want to delete " + path + "?"
            }, function(err, yes) {
                if (yes) {
                    eventbus.emit("sessionactivitystarted", edit.getSession(), "Deleting");

                    fs.deleteFile(path, function(err) {
                        if (err) {
                            return eventbus.emit("sessionactivityfailed", edit.getSession(), "Could not delete file: " + err);
                        }
                        session_manager.deleteSession(path);
                    });
                }
            });
        }

        function renameFile(edit) {
            var session = edit.getSession();
            var path = session.filename;
            console.log("Filename", path);
            ui.prompt({
                message: "New name:",
                input: path
            }, function(err, newPath) {
                var comparePath = path;
                var compareNewPath = newPath;
                if (useragent.isMac) {
                    comparePath = path.toLowerCase();
                    compareNewPath = newPath.toLowerCase();
                }
                if (newPath && comparePath !== compareNewPath) {
                    eventbus.emit("sessionactivitystarted", edit.getSession(), "Renaming");
                    fs.readFile(newPath, function(err) {
                        if (err) {
                            actuallyRenameFile(edit, session, path, newPath);
                        } else {
                            ui.prompt({
                                message: "Are you sure you want to delete the current file at " + newPath + "?"
                            }, function(err, yes) {
                                if (yes) {
                                    actuallyRenameFile(edit, session, path, newPath);
                                } else {
                                    eventbus.emit("sessionactivitycompleted", edit.getSession());
                                }
                            });
                        }
                    });
                }
            });
        }
        
        function actuallyRenameFile(edit, session, path, newPath) {
            fs.writeFile(newPath, session.getValue(), function(err) {
                if (err) {
                    return eventbus.emit("sessionactivityfailed", edit.getSession(), "Could not write to file: " + err);
                }
                // TODO: Copy session state
                session_manager.handleChangedFile(newPath);
                session_manager.go(newPath, edit);
                eventbus.emit("newfilecreated", newPath, session);
                fs.deleteFile(path, function(err) {
                    if (err) {
                        return eventbus.emit("sessionactivityfailed", edit.getSession(), "Could not delete file: " + err);
                    }
                    session_manager.deleteSession(path);
                    eventbus.emit("filedeleted", path);
                    eventbus.emit("sessionactivitycompleted", edit.getSession());
                });
            });
        }

        function copyFile(edit) {
            var session = edit.getSession();
            var path = session.filename;
            console.log("Filename", path);
            ui.prompt({
                message: "Copy to path:",
                input: path
            }, function(err, newPath) {
                if (newPath) {
                    eventbus.emit("sessionactivitystarted", edit.getSession(), "Copying");
                    fs.writeFile(newPath, session.getValue(), function(err) {
                        if (err) {
                            return eventbus.emit("sessionactivityfailed", edit.getSession(), "Could not write to file: " + err);
                        }
                        // TODO: Copy session state
                        session_manager.go(newPath, edit);
                        eventbus.emit("newfilecreated", newPath, session);
                        eventbus.emit("sessionactivitycompleted", edit.getSession());
                    });
                }
            });
        }

        command.define("File:Delete", {
            doc: "Remove the current file from disk.",
            exec: function(edit) {
                confirmDelete(edit);
            }
        });

        command.define("File:Rename", {
            doc: "Rename the current file on disk.",
            exec: function(edit) {
                renameFile(edit);
            }
        });

        command.define("File:Copy", {
            doc: "Copy the current file to a new path on disk.",
            exec: function(edit) {
                copyFile(edit);
            }
        });

        command.define("File:Delete Tree", {
            doc: "Recursively delete a directory, and all subdirectories and files contained within.",
            exec: function() {
                ui.prompt({
                    message: "Prefix of tree to delete:",
                    input: ""
                }, function(err, prefix) {
                    if (prefix) {
                        ui.prompt({
                            message: "Are you sure you want to delete all files under " + prefix + "?"
                        }, function(err, yes) {
                            if (!yes) {
                                return;
                            }
                            fs.listFiles(function(err, files) {
                                files = _.filter(files, function(path) {
                                    return path.indexOf(prefix) === 0;
                                });
                                async.each(files, function(path, next) {
                                    fs.deleteFile(path, next);
                                }, function() {
                                    goto.fetchFileList();
                                    console.log("All files under", prefix, "removed!");
                                });
                            });
                        });
                    }
                });
            },
            readOnly: true
        });

        register();
    }
});
