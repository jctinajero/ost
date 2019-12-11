/* Generic draft support for osTicket. The plugins supports draft retrieval
 * automatically, along with draft autosave, and image uploading.
 *
 * Configuration:
 * draftNamespace: namespace for the draft retrieval
 * draftObjectId: extension to the namespace for draft retrieval
 *
 * Caveats:
 * Login (staff only currently) is required server-side for drafts and image
 * uploads. Furthermore, the id of the staff is considered for the drafts,
 * so one user will not retrieve drafts for another user.
 */
(function(R$) {
  R$.add('plugin', 'draft', {
    init: function (app) {
        this.app = app;
        this.$textarea = $(this.app.rootElement);
        this.toolbar = this.app.toolbar;
        this.opts = app.opts;
        this.lastUpdate = 0;
        this.statusbar = app.statusbar;
    },

    start: function() {
        if (!this.opts.draftNamespace)
            return;

        var autosave_url = 'ajax.php/draft/' + this.opts.draftNamespace;
        if (this.opts.draftObjectId)
            autosave_url += '.' + this.opts.draftObjectId;
        this.opts.autosave = this.autoCreateUrl = autosave_url;
        this.opts.autosaveDelay = 4000;
        this.opts.imageUploadErrorCallback = this.displayError;
        if (this.opts.draftId) {
            this.statusbar.add('draft', __('all changes saved'));
            this._setup(this.opts.draftId);
        }
        else if (this.$textarea.hasClass('draft')) {
            // Just upload the file. A draft will be created automatically
            // and will be configured locally in the afterUpateDraft()
            this.opts.clipboardUpload =
            this.opts.imageUpload = this.autoCreateUrl + '/attach';
            this.opts.imageUploadCallback = this.afterUpdateDraft;
        }
        this.opts.autosaveData = {
            '__CSRFToken__': $("meta[name=csrf_token]").attr("content")
        };

        if (autosave_url)
            this.app.api('module.autosave.enable');

        if (this.app.source.getCode())
            this.app.broadcast('draft.recovered');
    },

    stop: function() {
        this.app.statusbar.remove('draft');
    },

    _setup: function (draft_id) {
        this.opts.draftId = draft_id;
        this.opts.autosave = 'ajax.php/draft/' + draft_id;
        this.opts.clipboardUpload =
        this.opts.imageUpload =
            'ajax.php/draft/' + draft_id + '/attach';

        // Add [Delete Draft] button to the toolbar
        if (this.opts.draftDelete) {
            var trash = this.deleteButton =
                this.toolbar.addButton('deletedraft', {
                    title: __('Delete Draft'),
                    api: 'plugin.draft.deleteDraft',
                    icon: 'icon-trash',
                });
            trash.addClass('pull-right icon-trash');
        }
    },

    onautosave: function(name, _, data) {
        // If the draft was created, a draft_id will be sent back — update
        // the URL to send updates in the future
        if (!this.opts.draftId && data.draft_id) {
            this._setup(data.draft_id);
            $(this.app.rootElement).attr('data-draft-id', this.opts.draftId);
        }

        this.statusbar.add('draft', __('all changes saved'));
        this.app.broadcast('draft.saved');
    },

    onautosaveSend: function() {
        this.statusbar.add('draft', __('saving...'));
    },

    onautosaveError: function(error) {
        if (error.code == 422)
            // Unprocessable request (Empty message)
            return;

        this.displayError(error);
        // Cancel autosave
        this.app.api('module.autosave.disable');
        this.statusbar.add('draft', '<span style="color:red">{}</span>'.replace('{}', __('save error')));
        this.app.broadcast('draft.failed');
    },

    onimage: {
        uploaded: function(image, response) {
            this.onautosave(null, null, response);
        },
        uploadError: function (response) {
            this.displayError(response);
        }
    },

    displayError: function(json) {
        $.sysAlert(json.error,
            __('Unable to save draft.')
          + __('Refresh the current page to restore and continue your draft.'));
    },

    onchanged: function() {
        this.statusbar.add('draft', __('unsaved'));
    },

    deleteDraft: function() {
        if (!this.opts.draftId)
            // Nothing to delete
            return;
        var self = this;
        $.ajax('ajax.php/draft/'+this.opts.draftId, {
            type: 'delete',
            success: function() {
                self.draft_id = self.opts.draftId = undefined;
                self.app.statusbar.remove('draft');
                self.app.source.setCode(self.opts.draftOriginal || '');
                self.opts.autosave = self.autoCreateUrl;
                self.deleteButton.hide();
                self.app.broadcast('draft.deleted');
            }
        });
    }
  });

  // Monkey patch the autosave module to include an `autosaveBefore` signal
  // and an delay option to limit calls to the backend.
  var stockAutosave = $R[$R.env['module']]['autosave'];
  R$.add('module', 'autosave', $R.extend(stockAutosave.prototype, {
    onsynced: function() {
        if (this.opts.autosave) {
            if (this.opts.autosaveDelay) {
                if (this.delayTimer)
                    clearInterval(this.delayTimer);
                this.delayTimer = setTimeout(this._sendDelayed.bind(this),
                    this.opts.autosaveDelay);
            }
            else {
                this._sendDelayed();
            }
        }
    },
    _sendDelayed: function() {
        this.app.broadcast('autosaveSend');
        this._send.call(this);
    },
  }));

  // Monkey patch the breakline feature to also enclose in the markup tag if
  // the markup tag is <div>
  var stockInsert = $R[$R.env['service']]['insertion'];
  $R.add('service', 'insertion', $R.extend(stockInsert.prototype, {
    insertBreakLine: function() {
        var el = this.selection.getCurrent(),
            rv = this.insertNode(document.createElement('br'), 'after');

        if (this.opts.markup === 'div') {
            var editor = this.app.editor.getElement().get();
            while (el != editor) {
                if (el.nodeName === 'div')
                    break;
                el = el.parentElement;
            }
            if (el != editor) {
                this.caret.setAfter(el);
                rv = this.insertNode(document.createElement('div'), 'start');
            }
        }
        return rv;
    }
  }));

  R$.add('plugin', 'autolock', {
    init: function (app) {
        this.app = app;
    },
    start: function () {
        var root = $(this.app.rootElement),
            code = root.closest('form').find('[name=lockCode]');
        if (code.length)
            this.lock = root.closest('[data-lock-object-id]');
    },
    onchanged: function(e) {
        if (this.lock)
            this.lock.exclusive('acquire');
    }
  });

  R$.add('plugin', 'signature', {
    init: function (app) {
        this.app = app;
    },
    start: function() {
        var $el = $R.dom(this.app.rootElement),
            $box = this.app.editor.getElement(),
            inner = $R.dom('<div class="inner"></div>'),
            $form = $el.closest('form'),
            signatureField = $el.data('signature-field');
        if (signatureField) {
            this.$signatureBox = $R.dom('<div class="selected-signature"></div>')
                .append(inner);
            this.app.editor.getElement().parent().find('.redactor-statusbar').before(this.$signatureBox);
            if ($el.data('signature'))
                inner.html($el.data('signature'));
            else
                this.$signatureBox.hide();
            $R.dom('input[name='+signatureField+']', $form)
                .on('change', this.updateSignature.bind(this));
            if ($el.data('dept-field'))
                $R.dom(':input[name='+$el.data('dept-field')+']', $form)
                    .on('change', this.updateSignature.bind(this));
            // Expand on hover
            var outer = this.$signatureBox,
                inner = $('.inner', this.$signatureBox).get(0),
                originalHeight = outer.height(),
                hoverTimeout = undefined,
                originalShadow = this.$signatureBox.css('box-shadow');
            this.$signatureBox.on('hover', function() {
                hoverTimeout = setTimeout(function() {
                    originalHeight = Math.max(originalHeight, outer.height());
                    $(this).animate({
                        'height': inner.offsetHeight
                    }, 'fast');
                    $(this).css('box-shadow', 'none', 'important');
                }.bind(this), 250);
            }, function() {
                clearTimeout(hoverTimeout);
                $(this).stop().animate({
                    'height': Math.min(inner.offsetHeight, originalHeight)
                }, 'fast');
                $(this).css('box-shadow', originalShadow);
            });
            $el.find('.redactor-box').css('border-bottom-style', 'none', true);
        }
    },
    updateSignature: function(e) {
        var $el = $(this.app.rootElement),
            signatureField = $el.data('signature-field'),
            $form = $el.closest('form'),
            selected = $(':input:checked[name='+signatureField+']', $form).val(),
            type = $R.dom(e.target).val(),
            dept = $R.dom(':input[name='+$el.data('dept-field')+']', $form).val(),
            url = 'ajax.php/content/signature/',
            inner = $R.dom('.inner', this.$signatureBox);
        e.preventDefault && e.preventDefault();
        if (selected == 'dept' && $el.data('dept-id'))
            url += 'dept/' + $el.data('dept-id');
        else if (selected == 'dept' && $el.data('dept-field')) {
            if (dept)
                url += 'dept/' + dept;
            else
                return inner.empty().parent().hide();
        }
        else if (selected == 'theirs' && $el.data('poster-id')) {
            url += 'agent/' + $el.data('poster-id');
        }
        else if (type == 'none')
           return inner.empty().parent().hide();
        else
            url += selected;

        $R.ajax.get({
            url: url,
            success: function(html) {
                inner.html(html).parent().show();
            }
        });
    }
  });
})(Redactor);

/* Redactor richtext init */
$(function() {
    var captureImageSizes = function(html) {
        $('img', this.$box).each(function(i, img) {
            // TODO: Rewrite the entire <img> tag. Otherwise the @width
            // and @height attributes will begin to accumulate
            before = img.outerHTML;
            if (img.clientWidth && img.clientHeight)
                $(img).attr('width', img.clientWidth)
                      .attr('height',img.clientHeight);
            html = html.replace(before, img.outerHTML);
        });
        return html;
    },
    redact = $.fn.redact = function(el, options) {
        var el = $(el),
            sizes = {'small': '75px', 'medium': '150px', 'large': '225px'},
            selectedSize = sizes['medium'];
        $.each(sizes, function(k, v) {
            if (el.hasClass(k)) selectedSize = v;
        });
        var options = $.extend({
                'air': el.hasClass('no-bar'),
                'buttons': el.hasClass('no-bar')
                  ? ['format', '|', 'bold', 'italic', 'underline', 'deleted', 'lists', 'link', 'image']
                  : ['html', 'format', 'fontcolor', 'fontfamily', 'bold',
                    'italic', 'underline', 'deleted', 'lists', 'image', 'video',
                    'file', 'table', 'link', 'alignment',
                    'line', 'fullscreen'],
                preClass: 'prettyprint linenums',
                'buttonSource': !el.hasClass('no-bar'),
                'autoresize': !el.hasClass('no-bar') && !el.closest('.dialog').length,
                'maxHeight': el.closest('.dialog').length ? selectedSize : false,
                'minHeight': selectedSize,
                'maxWidth': el.hasClass('fullscreen') ? '850px' : false,
                'focus': false,
                'plugins': el.hasClass('no-bar')
                  ? ['imagemanager','definedlinks']
                  : ['imagemanager','imageannotate','table','video','definedlinks','autolock'],
                'imageUpload': el.hasClass('draft'),
                'imageManagerJson': 'ajax.php/draft/images/browse',
                'imagePosition': true,
                'imageUploadData': {
                    '__CSRFToken__': $("meta[name=csrf_token]").attr("content")
                },
                'imageResizable': true,
                'syncBeforeCallback': captureImageSizes,
                'markup': 'div',
                'breakline': true,
                'tabFocus': false,
                'toolbarFixed': true,
                'callbacks': {
                    '_focus': function(e) { $(this.app.rootElement).addClass('no-pjax'); },
                    '_start': function() {
                        var $editor = this.app.editor.$editor;
                        if (this.$element.data('width'))
                            this.$editor.width(this.$element.data('width'));
                        this.$editor.attr('spellcheck', 'true');
                        var lang = this.$editor.closest('[lang]').attr('lang');
                        if (lang)
                            this.$editor.attr('lang', lang);
                    },
                },
                'linkSize': 100000,
                'definedlinks': 'ajax.php/config/links'
            }, options||{});
        if (el.data('redactor')) return;
        var reset = $('input[type=reset]', el.closest('form'));
        if (reset) {
            reset.click(function() {
<<<<<<< HEAD
<<<<<<< HEAD
                if (el.attr('data-draft-id'))
                    el.redactor('draft.deleteDraft').attr('data-draft-id', '');
                else
                    el.redactor('insert.set', '', false, false);
=======
                var file = $('.file');
=======
                var file = $('.file', el.closest('form'));
>>>>>>> Reset Button Fix:
                if (file)
                    file.remove();
                if (el.attr('data-draft-id')) {
                    el.redactor('plugin.draft.delete');
                    el.attr('data-draft-id', '');
                }
                else {
                    try {
                        el.redactor('module.source.set', '');
                    }
                    catch (error) {
                        el.redactor(); //reinitialize redactor
                        el.redactor('module.source.set', '');
                    }
                }
>>>>>>> Web Portal Fixes:
            });
        }
        if (!$.clientPortal) {
            options['plugins'] = options['plugins'].concat(
                    'fontcolor', 'fontfamily', 'signature');
        }
        if (el.hasClass('draft')) {
            el.closest('form').append($('<input type="hidden" name="draft_id"/>'));
            options['plugins'].push('draft');
            options.draftDelete = el.hasClass('draft-delete');
        }
        if (true || 'scp') { // XXX: Add this to SCP only
            options['plugins'].push('contexttypeahead');
        }
        if (el.hasClass('fullscreen'))
            options['plugins'].push('fullscreen');
        if (el.data('translateTag'))
            options['plugins'].push('translatable');
        if ($('#thread-items[data-thread-id]').length)
            options['imageManagerJson'] += '?threadId=' + $('#thread-items').data('threadId');
        getConfig().then(function(c) {
            if (c.lang && c.lang.toLowerCase() != 'en_us' &&
                    Redactor.lang[c.short_lang])
                options['lang'] = c.short_lang;
            if (c.has_rtl)
                options['plugins'].push('textdirection');
            if (el.find('rtl').length)
                options['direction'] = 'rtl';
            el.data('redactor', el.redactor(options));
        });
    },
    findRichtextBoxes = function() {
        $('.richtext').each(function(i,el) {
            if ($(el).hasClass('ifhtml'))
                // Check if html_thread is enabled first
                getConfig().then(function(c) {
                    if (c.html_thread)
                        redact(el);
                });
            else
                // Make a rich text editor immediately
                redact(el);
        });
    },
    cleanupRedactorElements = function() {
        // Tear down redactor editors on this page
        $('.richtext').each(function() {
            var redactor = $(this).data('redactor');
            if (redactor)
                redactor.stop();
        });
    };
    findRichtextBoxes();
    $(document).ajaxStop(findRichtextBoxes);
    $(document).on('pjax:start', cleanupRedactorElements);
});

$(document).on('focusout.redactor', 'div.redactor_richtext', function (e) {
    alert('focusout.redactor');
    $(this).siblings('textarea').trigger('change');
});

$(document).ajaxError(function(event, request, settings) {
    if (settings.url.indexOf('ajax.php/draft') != -1
            && settings.type.toUpperCase() == 'POST') {
        $('.richtext').each(function() {
            var redactor = $(this).data('redactor');
            if (redactor) {
                redactor.autosave.disable();
            }
        });
        $.sysAlert(__('Unable to save draft.'),
            __('Refresh the current page to restore and continue your draft.'));
    }
});
