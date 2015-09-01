import os
from django.conf import settings
from django.conf.urls import url
from django.views.static import serve

document_root = os.path.abspath(os.path.join(settings.BASE_DIR, "../")).replace("\\", "/")
urlpatterns = [
    url(r'^(?P<path>.*)$', serve, {'document_root': document_root, 'show_indexes': True})
]
